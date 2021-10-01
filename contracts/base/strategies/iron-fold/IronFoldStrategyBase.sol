// SPDX-License-Identifier: ISC
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/

pragma solidity 0.8.4;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../StrategyBase.sol";
import "../../../third_party/iron/CompleteRToken.sol";
import "../../../third_party/iron/IronPriceOracle.sol";
import "../../interface/ISmartVault.sol";

/// @title Abstract contract for Iron lending strategy implementation with folding functionality
/// @author JasperS13
/// @author belbix
abstract contract IronFoldStrategyBase is StrategyBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "IronFoldStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.1.2";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;
  /// @dev Maximum folding loops
  uint256 public constant MAX_DEPTH = 20;
  /// @dev ICE rToken address for reward price determination
  address public constant ICE_R_TOKEN = 0xf535B089453dfd8AE698aF6d7d5Bc9f804781b81;

  /// @notice RToken address
  address public rToken;
  /// @notice Iron Controller address
  address public ironController;

  /// @notice Numerator value for the targeted borrow rate
  uint256 public borrowTargetFactorNumeratorStored;
  uint256 public borrowTargetFactorNumerator;
  /// @notice Numerator value for the asset market collateral value
  uint256 public collateralFactorNumerator;
  /// @notice Denominator value for the both above mentioned ratios
  uint256 public factorDenominator;
  /// @notice Use folding
  bool public fold = true;

  /// @notice Strategy balance parameters to be tracked
  uint256 public suppliedInUnderlying;
  uint256 public borrowedInUnderlying;

  event FoldChanged(bool value);
  event FoldStopped();
  event FoldStarted(uint256 borrowTargetFactorNumerator);
  event MaxDepthReached();
  event NoMoneyForLiquidateUnderlying();
  event UnderlyingLiquidationFailed();
  event Rebalanced(uint256 supplied, uint256 borrowed, uint256 borrowTarget);
  event BorrowTargetFactorNumeratorChanged(uint256 value);
  event CollateralFactorNumeratorChanged(uint256 value);

  modifier updateSupplyInTheEnd() {
    _;
    suppliedInUnderlying = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    borrowedInUnderlying = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
  }

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  /// @param __rewardTokens Reward tokens that the strategy will farm
  /// @param _rToken RToken address
  /// @param _ironController Iron Controller address
  /// @param _borrowTargetFactorNumerator Numerator value for the targeted borrow rate
  /// @param _collateralFactorNumerator Numerator value for the asset market collateral value
  /// @param _factorDenominator Denominator value for the both above mentioned ratios
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _rToken,
    address _ironController,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator,
    uint256 _factorDenominator
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_rToken != address(0), "IFS: Zero address rToken");
    require(_ironController != address(0), "IFS: Zero address ironController");
    rToken = _rToken;
    ironController = _ironController;

    address _lpt = CompleteRToken(rToken).underlying();
    require(_lpt == _underlyingToken, "IFS: Wrong underlying");

    factorDenominator = _factorDenominator;

    require(_collateralFactorNumerator < factorDenominator, "IFS: Collateral factor cannot be this high");
    collateralFactorNumerator = _collateralFactorNumerator;

    require(_borrowTargetFactorNumerator < collateralFactorNumerator, "IFS: Target should be lower than collateral limit");
    borrowTargetFactorNumeratorStored = _borrowTargetFactorNumerator;
    borrowTargetFactorNumerator = _borrowTargetFactorNumerator;
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance supplied minus borrowed
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256) {
    return suppliedInUnderlying.sub(borrowedInUnderlying);
  }

  /// @notice Return approximately amount of reward tokens ready to claim in Iron MasterChef contract
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external pure override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    return rewards;
  }

  /// @notice TVL of the underlying in the rToken contract
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return CompleteRToken(rToken).getCash()
    .add(CompleteRToken(rToken).totalBorrows())
    .sub(CompleteRToken(rToken).totalReserves());
  }

  /// @notice stub to zero
  function poolWeeklyRewardsAmount() external pure override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    return rewards;
  }

  /// @dev Calculate expected rewards rate for reward token
  function rewardsRateNormalised() public view returns (uint256){
    CompleteRToken rt = CompleteRToken(rToken);
    uint8 underlyingDecimals = ERC20(rt.underlying()).decimals();

    // get reward per token for both - suppliers and borrowers
    uint256 rewardSpeed = IronControllerInterface(ironController).rewardSpeeds(rToken);
    // using internal Iron Oracle the safest way
    uint256 rewardTokenPrice = rTokenUnderlyingPrice(ICE_R_TOKEN);
    // normalize reward speed to USD price
    uint256 rewardSpeedUsd = rewardSpeed * rewardTokenPrice / 1e18;

    // get total supply, cash and borrows, and normalize them to 18 decimals
    uint256 totalSupply = rt.totalSupply() * 1e18 / (10 ** rt.decimals());
    uint256 totalBorrows = rt.totalBorrows() * 1e18 / (10 ** underlyingDecimals);

    // for avoiding revert for empty market
    if (totalSupply == 0 || totalBorrows == 0) {
      return 0;
    }

    // exchange rate between rToken and underlyingToken
    uint256 rTokenExchangeRate = rt.exchangeRateStored() * (10 ** rt.decimals()) / (10 ** underlyingDecimals);

    // amount of reward tokens per block for 1 supplied underlyingToken
    uint256 rewardSpeedUsdPerSuppliedToken = rewardSpeedUsd * 1e18 / rTokenExchangeRate * 1e18 / totalSupply / 2;
    // amount of reward tokens per block for 1 borrowed underlyingToken
    uint256 rewardSpeedUsdPerBorrowedToken = rewardSpeedUsd * 1e18 / totalBorrows / 2;

    return rewardSpeedUsdPerSuppliedToken + rewardSpeedUsdPerBorrowedToken;
  }

  /// @dev Return a normalized to 18 decimal cost of folding
  function foldCostRatePerToken() public view returns (uint256) {
    CompleteRToken rt = CompleteRToken(rToken);

    // if for some reason supply rate higher than borrow we pay nothing for the borrows
    if (rt.supplyRatePerBlock() >= rt.borrowRatePerBlock()) {
      return 1;
    }
    uint256 foldRateCost = rt.borrowRatePerBlock() - rt.supplyRatePerBlock();
    uint256 _rTokenPrice = rTokenUnderlyingPrice(rToken);

    // let's calculate profit for 1 token
    return foldRateCost * _rTokenPrice / 1e18;
  }

  /// @dev Return rToken price from Iron Oracle solution. Can be used on-chain safely
  function rTokenUnderlyingPrice(address _rToken) public view returns (uint256){
    uint8 underlyingDecimals = ERC20(CompleteRToken(_rToken).underlying()).decimals();
    uint256 _rTokenPrice = IronPriceOracle(
      IronControllerInterface(ironController).oracle()
    ).getUnderlyingPrice(_rToken);
    // normalize token price to 1e18
    if (underlyingDecimals < 18) {
      _rTokenPrice = _rTokenPrice / (10 ** (18 - underlyingDecimals));
    }
    return _rTokenPrice;
  }

  /// @dev Return true if we can gain profit with folding
  function isFoldingProfitable() public view returns (bool) {
    // compare values per block per 1$
    return rewardsRateNormalised() > foldCostRatePerToken();
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override restricted {
    claimReward();
    compound();
    liquidateReward();
    investAllUnderlying();
    if (!isFoldingProfitable() && fold) {
      stopFolding();
    } else if (isFoldingProfitable() && !fold) {
      startFolding();
    } else {
      rebalance();
    }
  }

  /// @dev Rebalances the borrow ratio
  function rebalance() public restricted updateSupplyInTheEnd {
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 balance = supplied.sub(borrowed);
    uint256 borrowTarget = balance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
    if (borrowed > borrowTarget) {
      _redeemPartialWithLoan(0);
    } else if (borrowed < borrowTarget) {
      depositToPool(0);
    }
    emit Rebalanced(supplied, borrowed, borrowTarget);
  }

  /// @dev Set use folding
  function setFold(bool _fold) public restricted {
    fold = _fold;
    emit FoldChanged(_fold);
  }

  /// @dev Set borrow rate target
  function setBorrowTargetFactorNumeratorStored(uint256 _target) public restricted {
    require(_target < collateralFactorNumerator, "Target should be lower than collateral limit");
    borrowTargetFactorNumeratorStored = _target;
    if (fold) {
      borrowTargetFactorNumerator = _target;
    }
    emit BorrowTargetFactorNumeratorChanged(_target);
  }

  function stopFolding() public restricted {
    borrowTargetFactorNumerator = 0;
    setFold(false);
    rebalance();
    emit FoldStopped();
  }

  function startFolding() public restricted {
    borrowTargetFactorNumerator = borrowTargetFactorNumeratorStored;
    setFold(true);
    rebalance();
    emit FoldStarted(borrowTargetFactorNumeratorStored);
  }

  /// @dev Set collateral rate for asset market
  function setCollateralFactorNumerator(uint256 _target) external restricted {
    require(_target < factorDenominator, "Collateral factor cannot be this high");
    collateralFactorNumerator = _target;
    emit CollateralFactorNumeratorChanged(_target);
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to rToken contract
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override updateSupplyInTheEnd {
    if (amount > 0) {
      // we need to sell excess in non hardWork function for keeping ppfs ~1
      liquidateExcessUnderlying();
      _supply(amount);
    }
    if (!fold || !isFoldingProfitable()) {
      return;
    }
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 balance = supplied.sub(borrowed);
    uint256 borrowTarget = balance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
    uint256 i = 0;
    while (borrowed < borrowTarget) {
      uint256 wantBorrow = borrowTarget.sub(borrowed);
      uint256 maxBorrow = supplied.mul(collateralFactorNumerator).div(factorDenominator).sub(borrowed);
      _borrow(Math.min(wantBorrow, maxBorrow));
      uint256 underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
      if (underlyingBalance > 0) {
        _supply(underlyingBalance);
      }
      //update parameters
      supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
      borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
      i++;
      if (i == MAX_DEPTH) {
        emit MaxDepthReached();
        break;
      }
    }
  }

  /// @dev Withdraw underlying from Iron MasterChef finance
  /// @param amount Withdraw amount
  function withdrawAndClaimFromPool(uint256 amount) internal override updateSupplyInTheEnd {
    claimReward();
    _redeemPartialWithLoan(amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override updateSupplyInTheEnd {
    _redeemMaximumWithLoan();
  }

  function exitRewardPool() internal override updateSupplyInTheEnd {
    uint256 bal = rewardPoolBalance();
    if (bal != 0) {
      claimReward();
      _redeemMaximumWithLoan();
      // reward liquidation can ruin transaction, do it in hard work process
    }
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  /// @dev Claim distribution rewards
  function claimReward() internal {
    address[] memory markets = new address[](1);
    markets[0] = rToken;
    IronControllerInterface(ironController).claimReward(address(this), markets);
  }

  function compound() internal {
    suppliedInUnderlying = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    borrowedInUnderlying = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 ppfs = ISmartVault(_smartVault).getPricePerFullShare();
    uint256 ppfsPeg = ISmartVault(_smartVault).underlyingUnit();

    // in case of negative ppfs compound all profit to underlying
    if (ppfs < ppfsPeg) {
      for (uint256 i = 0; i < _rewardTokens.length; i++) {
        uint256 amount = rewardBalance(i);
        address rt = _rewardTokens[i];
        // it will sell reward token to Target Token and send back
        if (amount != 0) {
          address forwarder = IController(controller()).feeRewardForwarder();
          // keep a bit for for distributing for catch all necessary events
          amount = amount * 90 / 100;
          IERC20(rt).safeApprove(forwarder, 0);
          IERC20(rt).safeApprove(forwarder, amount);
          uint256 underlyingProfit = IFeeRewardForwarder(forwarder).liquidate(rt, _underlyingToken, amount);
          // supply profit for correct ppfs calculation
          if (underlyingProfit != 0) {
            _supply(underlyingProfit);
          }
        }
      }
      // safe way to keep ppfs peg is sell excess after reward liquidation
      // it should not decrease old ppfs
      liquidateExcessUnderlying();
      // in case of ppfs decreasing we will get revert in vault anyway
      require(ppfs <= ISmartVault(_smartVault).getPricePerFullShare(), "IFS: Ppfs decreased after compound");
    }
  }

  /// @dev We should keep PPFS ~1
  ///      This function must not ruin transaction
  function liquidateExcessUnderlying() internal updateSupplyInTheEnd {
    // update balances for accurate ppfs calculation
    suppliedInUnderlying = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    borrowedInUnderlying = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    address forwarder = IController(controller()).feeRewardForwarder();
    uint256 ppfs = ISmartVault(_smartVault).getPricePerFullShare();
    uint256 ppfsPeg = ISmartVault(_smartVault).underlyingUnit();

    if (ppfs > ppfsPeg) {
      uint256 undBal = ISmartVault(_smartVault).underlyingBalanceWithInvestment();
      if (undBal == 0
      || ERC20(_smartVault).totalSupply() == 0
      || undBal < ERC20(_smartVault).totalSupply()
        || undBal - ERC20(_smartVault).totalSupply() < 2) {
        // no actions in case of no money
        emit NoMoneyForLiquidateUnderlying();
        return;
      }
      // ppfs = 1 if underlying balance = total supply
      // -1 for avoiding problem with rounding
      uint256 toLiquidate = (undBal - ERC20(_smartVault).totalSupply()) - 1;
      if (underlyingBalance() < toLiquidate) {
        _redeemPartialWithLoan(toLiquidate - underlyingBalance());
      }
      toLiquidate = Math.min(underlyingBalance(), toLiquidate);
      if (toLiquidate != 0) {
        IERC20(_underlyingToken).safeApprove(forwarder, 0);
        IERC20(_underlyingToken).safeApprove(forwarder, toLiquidate);

        // it will sell reward token to Target Token and distribute it to SmartVault and PS
        // we must not ruin transaction in any case
        //slither-disable-next-line unused-return,variable-scope,uninitialized-local
        try IFeeRewardForwarder(forwarder).distribute(toLiquidate, _underlyingToken, _smartVault)
        returns (uint256 targetTokenEarned) {
          if (targetTokenEarned > 0) {
            IBookkeeper(IController(controller()).bookkeeper()).registerStrategyEarned(targetTokenEarned);
          }
        } catch {
          emit UnderlyingLiquidationFailed();
        }
        suppliedInUnderlying = CompleteRToken(rToken).balanceOfUnderlying(address(this));
        borrowedInUnderlying = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
      }
    }
  }

  /// @dev Supplies to Iron
  function _supply(uint256 amount) internal updateSupplyInTheEnd returns (uint256) {
    uint256 balance = IERC20(_underlyingToken).balanceOf(address(this));
    if (amount < balance) {
      balance = amount;
    }
    IERC20(_underlyingToken).safeApprove(rToken, 0);
    IERC20(_underlyingToken).safeApprove(rToken, balance);
    require(CompleteRToken(rToken).mint(balance) == 0, "IFS: Supplying failed");
    return balance;
  }

  /// @dev Borrows against the collateral
  function _borrow(uint256 amountUnderlying) internal updateSupplyInTheEnd {
    // Borrow, check the balance for this contract's address
    require(CompleteRToken(rToken).borrow(amountUnderlying) == 0, "IFS: Borrow failed");
  }

  /// @dev Redeem liquidity in underlying
  function _redeemUnderlying(uint256 amountUnderlying) internal updateSupplyInTheEnd {
    // we can have a very little gap, it will slightly decrease ppfs and should be covered with reward liquidation process
    amountUnderlying = Math.min(amountUnderlying, CompleteRToken(rToken).balanceOfUnderlying(address(this)));
    if (amountUnderlying > 0) {
      uint256 redeemCode = 999;
      try CompleteRToken(rToken).redeemUnderlying(amountUnderlying) returns (uint256 code) {
        redeemCode = code;
      } catch{}
      if (redeemCode != 0) {
        // iron has verification function that can ruin tx with underlying, in this case redeem rToken will work
        (,,, uint256 exchangeRate) = CompleteRToken(rToken).getAccountSnapshot(address(this));
        uint256 rTokenRedeem = amountUnderlying * 1e18 / exchangeRate;
        if (rTokenRedeem > 0) {
          _redeemRToken(rTokenRedeem);
        }
      }
    }
  }

  /// @dev Redeem liquidity in rToken
  function _redeemRToken(uint256 amountRToken) internal updateSupplyInTheEnd {
    if (amountRToken > 0) {
      require(CompleteRToken(rToken).redeem(amountRToken) == 0, "IFS: Redeem failed");
    }
  }

  /// @dev Repay a loan
  function _repay(uint256 amountUnderlying) internal updateSupplyInTheEnd {
    if (amountUnderlying != 0) {
      IERC20(_underlyingToken).safeApprove(rToken, 0);
      IERC20(_underlyingToken).safeApprove(rToken, amountUnderlying);
      require(CompleteRToken(rToken).repayBorrow(amountUnderlying) == 0, "IFS: Repay failed");
    }
  }

  /// @dev Redeems the maximum amount of underlying. Either all of the balance or all of the available liquidity.
  function _redeemMaximumWithLoan() internal updateSupplyInTheEnd {
    // amount of liquidity
    uint256 available = CompleteRToken(rToken).getCash();
    // amount we supplied
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    // amount we borrowed
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 balance = supplied.sub(borrowed);

    _redeemPartialWithLoan(Math.min(available, balance));

    // we have a little amount of supply after full exit
    // better to redeem rToken amount for avoid rounding issues
    (,uint256 rTokenBalance,,) = CompleteRToken(rToken).getAccountSnapshot(address(this));
    if (rTokenBalance > 0) {
      _redeemRToken(rTokenBalance);
    }
  }

  /// @dev Redeems a set amount of underlying tokens while keeping the borrow ratio healthy.
  ///      This function must nor revert transaction
  function _redeemPartialWithLoan(uint256 amount) internal updateSupplyInTheEnd {
    // amount we supplied
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    // amount we borrowed
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 oldBalance = supplied.sub(borrowed);
    uint256 newBalance = 0;
    if (amount < oldBalance) {
      newBalance = oldBalance.sub(amount);
    }
    uint256 newBorrowTarget = newBalance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
    uint256 underlyingBalance = 0;
    uint256 i = 0;
    while (borrowed > newBorrowTarget) {
      uint256 requiredCollateral = borrowed.mul(factorDenominator).div(collateralFactorNumerator);
      uint256 toRepay = borrowed.sub(newBorrowTarget);
      if (supplied < requiredCollateral) {
        break;
      }
      // redeem just as much as needed to repay the loan
      // supplied - requiredCollateral = max redeemable, amount + repay = needed
      uint256 toRedeem = Math.min(supplied.sub(requiredCollateral), amount.add(toRepay));
      _redeemUnderlying(toRedeem);
      // now we can repay our borrowed amount
      underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
      toRepay = Math.min(toRepay, underlyingBalance);
      if (toRepay == 0) {
        // in case of we don't have money for repaying we can't do anything
        break;
      }
      _repay(toRepay);
      // update the parameters
      borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
      supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
      i++;
      if (i == MAX_DEPTH) {
        emit MaxDepthReached();
        break;
      }
    }
    underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
    if (underlyingBalance < amount) {
      uint256 toRedeem = amount.sub(underlyingBalance);
      // redeem the most we can redeem
      _redeemUnderlying(toRedeem);
    }
  }
}
