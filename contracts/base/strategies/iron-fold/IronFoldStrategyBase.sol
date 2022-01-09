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
import "../FoldingBase.sol";
import "../../../third_party/iron/CompleteRToken.sol";
import "../../../third_party/iron/IRMatic.sol";
import "../../../third_party/iron/IronPriceOracle.sol";
import "../../../third_party/IWmatic.sol";
import "../../interface/IIronFoldStrategy.sol";

/// @title Abstract contract for Iron lending strategy implementation with folding functionality
/// @author JasperS13
/// @author belbix
abstract contract IronFoldStrategyBase is FoldingBase, IIronFoldStrategy {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "IronFoldStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.4.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;
  /// @dev precision for the folding profitability calculation
  uint256 private constant _PRECISION = 10 ** 18;
  /// @dev ICE rToken address for reward price determination
  address public constant ICE_R_TOKEN = 0xf535B089453dfd8AE698aF6d7d5Bc9f804781b81;
  address public constant W_MATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
  address public constant R_ETHER = 0xCa0F37f73174a28a64552D426590d3eD601ecCa1;

  /// @notice RToken address
  address public override rToken;
  /// @notice Iron Controller address
  address public override ironController;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _rToken,
    address _ironController,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator
  ) FoldingBase(
    _controller,
    _underlying,
    _vault,
    __rewardTokens,
    _BUY_BACK_RATIO,
    _borrowTargetFactorNumerator,
    _collateralFactorNumerator
  ) {
    require(_rToken != address(0), "IFS: Zero address rToken");
    require(_ironController != address(0), "IFS: Zero address ironController");
    rToken = _rToken;
    ironController = _ironController;

    if (_isMatic()) {
      require(_underlyingToken == W_MATIC, "IFS: Only wmatic allowed");
    } else {
      address _lpt = CompleteRToken(rToken).underlying();
      require(_lpt == _underlyingToken, "IFS: Wrong underlying");
    }
  }

  /////////////////////////////////////////////
  ////////////BASIC STRATEGY FUNCTIONS/////////
  /////////////////////////////////////////////

  /// @notice Return approximately amount of reward tokens ready to claim in Iron Controller contract
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    rewards[0] = IronControllerInterface(ironController).rewardAccrued(address(this));
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

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  ///////////////////////////////////////////////////////////////////////////////////////
  ///////////// internal functions require specific implementation for each platforms ///
  ///////////////////////////////////////////////////////////////////////////////////////

  function _getInvestmentData() internal override returns (uint256 supplied, uint256 borrowed){
    supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
  }

  /// @dev Return true if we can gain profit with folding
  function _isFoldingProfitable() internal view override returns (bool) {
    (uint256 supplyRewardsInUSDC,
    uint256 borrowRewardsInUSDC,
    uint256 supplyUnderlyingProfitInUSDC,
    uint256 debtUnderlyingCostInUSDC) = totalRewardPredictionInUSDC();

    uint256 foldingProfitPerToken = supplyRewardsInUSDC + borrowRewardsInUSDC + supplyUnderlyingProfitInUSDC;
    return foldingProfitPerToken > debtUnderlyingCostInUSDC;
  }

  /// @dev Claim distribution rewards
  function _claimReward() internal override {
    address[] memory markets = new address[](1);
    markets[0] = rToken;
    IronControllerInterface(ironController).claimReward(address(this), markets);
  }

  function _supply(uint256 amount) internal override updateSupplyInTheEnd {
    amount = Math.min(IERC20(_underlyingToken).balanceOf(address(this)), amount);
    if (_isMatic()) {
      wmaticWithdraw(amount);
      IRMatic(rToken).mint{value : amount}();
    } else {
      IERC20(_underlyingToken).safeApprove(rToken, 0);
      IERC20(_underlyingToken).safeApprove(rToken, amount);
      require(CompleteRToken(rToken).mint(amount) == 0, "IFS: Supplying failed");
    }
  }

  function _borrow(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    // Borrow, check the balance for this contract's address
    require(CompleteRToken(rToken).borrow(amountUnderlying) == 0, "IFS: Borrow failed");
    if (_isMatic()) {
      IWmatic(W_MATIC).deposit{value : address(this).balance}();
    }
  }

  function _redeemUnderlying(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    amountUnderlying = Math.min(amountUnderlying, _maxRedeem());
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
          _redeemLoanToken(rTokenRedeem);
        }
      }
      if (_isMatic()) {
        IWmatic(W_MATIC).deposit{value : address(this).balance}();
      }
    }
  }

  function _redeemLoanToken(uint256 amount) internal updateSupplyInTheEnd {
    if (amount > 0) {
      require(CompleteRToken(rToken).redeem(amount) == 0, "IFS: Redeem failed");
    }
  }

  function _repay(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    if (amountUnderlying != 0) {
      if (_isMatic()) {
        wmaticWithdraw(amountUnderlying);
        IRMatic(rToken).repayBorrow{value : amountUnderlying}();
      } else {
        IERC20(_underlyingToken).safeApprove(rToken, 0);
        IERC20(_underlyingToken).safeApprove(rToken, amountUnderlying);
        require(CompleteRToken(rToken).repayBorrow(amountUnderlying) == 0, "IFS: Repay failed");
      }
    }
  }

  /// @dev Redeems the maximum amount of underlying. Either all of the balance or all of the available liquidity.
  function _redeemMaximumWithLoan() internal override updateSupplyInTheEnd {
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 balance = supplied.sub(borrowed);
    _redeemPartialWithLoan(balance);

    // we have a little amount of supply after full exit
    // better to redeem rToken amount for avoid rounding issues
    (,uint256 rTokenBalance,,) = CompleteRToken(rToken).getAccountSnapshot(address(this));
    if (rTokenBalance > 0) {
      _redeemLoanToken(rTokenBalance);
    }
  }

  /////////////////////////////////////////////
  ////////////SPECIFIC INTERNAL FUNCTIONS//////
  /////////////////////////////////////////////

  function decimals() private view returns (uint8) {
    return CompleteRToken(rToken).decimals();
  }

  function underlyingDecimals() private view returns (uint8) {
    return IERC20Extended(_underlyingToken).decimals();
  }

  /// @notice returns forecast of all rewards (ICE and underlying) for the given period of time
  function totalRewardPrediction() private view returns (
    uint256 supplyRewards,
    uint256 borrowRewards,
    uint256 supplyUnderlyingProfit,
    uint256 debtUnderlyingCost
  ){
    CompleteRToken rt = CompleteRToken(rToken);
    // get reward per token for both - suppliers and borrowers
    uint256 rewardSpeed = IronControllerInterface(ironController).rewardSpeeds(rToken);
    // get total supply, cash and borrows, and normalize them to 18 decimals
    uint256 totalSupply = rt.totalSupply() * 1e18 / (10 ** decimals());
    uint256 totalBorrows = rt.totalBorrows() * 1e18 / (10 ** underlyingDecimals());
    if (totalSupply == 0 || totalBorrows == 0) {
      return (0, 0, 0, 0);
    }

    // exchange rate between rToken and underlyingToken
    uint256 rTokenExchangeRate = rt.exchangeRateStored() * (10 ** decimals()) / (10 ** underlyingDecimals());

    // amount of reward tokens per block for 1 supplied underlyingToken
    supplyRewards = rewardSpeed * 1e18 / rTokenExchangeRate * 1e18 / totalSupply;
    // amount of reward tokens per block for 1 borrowed underlyingToken
    borrowRewards = rewardSpeed * 1e18 / totalBorrows;
    supplyUnderlyingProfit = rt.supplyRatePerBlock();
    debtUnderlyingCost = rt.borrowRatePerBlock();
    return (supplyRewards, borrowRewards, supplyUnderlyingProfit, debtUnderlyingCost);
  }

  /// @notice returns forecast of all rewards (ICE and underlying)
  ///         for the given period of time in USDC token using ICE price oracle
  function totalRewardPredictionInUSDC() private view returns (
    uint256 supplyRewardsInUSDC,
    uint256 borrowRewardsInUSDC,
    uint256 supplyUnderlyingProfitInUSDC,
    uint256 debtUnderlyingCostInUSDC
  ){
    uint256 rewardTokenUSDC = IronPriceOracle(IronControllerInterface(ironController).oracle()).getUnderlyingPrice(ICE_R_TOKEN);
    uint256 rTokenUSDC = rTokenUnderlyingPrice(rToken);
    (uint256 supplyRewards, uint256 borrowRewards,
    uint256 supplyUnderlyingProfit, uint256 debtUnderlyingCost) = totalRewardPrediction();

    supplyRewardsInUSDC = supplyRewards * rewardTokenUSDC / _PRECISION;
    borrowRewardsInUSDC = borrowRewards * rewardTokenUSDC / _PRECISION;
    supplyUnderlyingProfitInUSDC = supplyUnderlyingProfit * rTokenUSDC / _PRECISION;
    debtUnderlyingCostInUSDC = debtUnderlyingCost * rTokenUSDC / _PRECISION;
  }

  /// @dev Return rToken price from Iron Oracle solution. Can be used on-chain safely
  function rTokenUnderlyingPrice(address _rToken) public view returns (uint256){
    uint256 _rTokenPrice = IronPriceOracle(
      IronControllerInterface(ironController).oracle()
    ).getUnderlyingPrice(_rToken);
    // normalize token price to 1e18
    if (underlyingDecimals() < 18) {
      _rTokenPrice = _rTokenPrice / (10 ** (18 - underlyingDecimals()));
    }
    return _rTokenPrice;
  }

  function wmaticWithdraw(uint256 amount) private {
    require(IERC20(W_MATIC).balanceOf(address(this)) >= amount, "IFS: Not enough wmatic");
    IWmatic(W_MATIC).withdraw(amount);
  }

  function _isMatic() internal view returns (bool) {
    return rToken == R_ETHER;
  }

}
