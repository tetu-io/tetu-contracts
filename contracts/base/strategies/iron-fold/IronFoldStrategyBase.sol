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
import "../StrategyBase.sol";
import "../../../third_party/iron/IIronChef.sol";
import "../../../third_party/iron/IRMatic.sol";
import "../../../third_party/iron/CompleteRToken.sol";


/// @title Abstract contract for Iron strategy implementation
/// @author JasperS13
abstract contract IronFoldStrategyBase is StrategyBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant STRATEGY_NAME = "IronFoldStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;

  /// @notice RToken address
  address public rToken;
  /// @notice Iron Controller address
  address public ironController;

  /// @notice Numerator value for the targeted borrow rate
  uint256 public borrowTargetFactorNumerator;
  /// @notice Numerator value for the asset market collateral value
  uint256 public collateralFactorNumerator;
  /// @notice Denominator value for the both above mentioned ratios
  uint256 public factorDenominator;
  /// @notice Using folding
  bool public fold;

  /// @notice Strategy balance parameters to be tracked
  uint256 public suppliedInUnderlying;
  uint256 public borrowedInUnderlying;

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
  /// @param _fold Using folding
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _rToken,
    address _ironController,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator,
    uint256 _factorDenominator,
    bool _fold
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_rToken != address(0), "zero address rToken");
    require(_ironController != address(0), "zero address ironController");
    rToken = _rToken;
    ironController = _ironController;

    address _lpt = CompleteRToken(rToken).underlying();
    require(_lpt == _underlyingToken, "wrong underlying");

    factorDenominator = _factorDenominator;
    require(_collateralFactorNumerator < factorDenominator, "Collateral factor cannot be this high");
    collateralFactorNumerator = _collateralFactorNumerator;
    require(_borrowTargetFactorNumerator < collateralFactorNumerator, "Target should be lower than collateral limit");
    borrowTargetFactorNumerator = _borrowTargetFactorNumerator;
    fold = _fold;
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
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    return rewards;
  }

  /// @notice TVL of the underlying in the rToken contract
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return CompleteRToken(rToken).getCash().add(CompleteRToken(rToken).totalBorrows());
  }

  /// @notice Calculate approximately weekly reward amounts for each reward tokens
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array of weekly reward amounts
  function poolWeeklyRewardsAmount() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    return rewards;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override restricted {
    claimReward();
    liquidateReward();
    rebalance();
  }

  /// @dev Rebalances the borrow ratio
  function rebalance() public restricted updateSupplyInTheEnd {
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 balance = supplied.sub(borrowed);
    uint256 borrowTarget = balance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
    if (borrowed > borrowTarget) {
      _redeemPartialWithLoan(0);
    } else {
      depositToPool(0);
    }
  }

  /// @dev Set use folding
  function setFold(bool _fold) external restricted {
    fold = _fold;
  }

  /// @dev Set borrow rate target
  function setBorrowTargetFactorNumerator(uint256 _target) external restricted {
    require(_target < collateralFactorNumerator, "Target should be lower than collateral limit");
    borrowTargetFactorNumerator = _target;
  }

  /// @dev Set collateral rate for asset market
  function setCollateralFactorNumerator(uint256 _target) external restricted {
    require(_target < factorDenominator, "Collateral factor cannot be this high");
    collateralFactorNumerator = _target;
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Claim distribution rewards
  function claimReward() internal {
    address[] memory markets = new address[](1);
    markets[0] = rToken;
    IronControllerInterface(ironController).claimReward(address(this), markets);
  }

  /// @dev Deposit underlying to rToken contract
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override updateSupplyInTheEnd {
    if (amount > 0) {
      _supply(amount);
    }
    if (!fold) {
      return;
    }
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 balance = supplied.sub(borrowed);
    uint256 borrowTarget = balance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
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
      balance = supplied.sub(borrowed);
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

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  /// @dev Supplies to Iron
  function _supply(uint256 amount) internal returns(uint256) {
    uint256 balance = IERC20(_underlyingToken).balanceOf(address(this));
    if (amount < balance) {
      balance = amount;
    }
    IERC20(_underlyingToken).safeApprove(rToken, 0);
    IERC20(_underlyingToken).safeApprove(rToken, balance);
    uint256 mintResult = CompleteRToken(rToken).mint(balance);
    require(mintResult == 0, "Supplying failed");
    return balance;
  }

  /// @dev Borrows against the collateral
  function _borrow(uint256 amountUnderlying) internal {
    // Borrow, check the balance for this contract's address
    uint256 result = CompleteRToken(rToken).borrow(amountUnderlying);
    require(result == 0, "Borrow failed");
  }

  /// @dev Redeem liquidity in underlying
  function _redeemUnderlying(uint256 amountUnderlying) internal {
    if (amountUnderlying > 0) {
      CompleteRToken(rToken).redeemUnderlying(amountUnderlying);
    }
  }

  /// @dev Repays a loan
  function _repay(uint256 amountUnderlying) internal {
    IERC20(_underlyingToken).safeApprove(rToken, 0);
    IERC20(_underlyingToken).safeApprove(rToken, amountUnderlying);
    CompleteRToken(rToken).repayBorrow(amountUnderlying);
  }

  /// @dev Redeems the maximum amount of underlying. Either all of the balance or all of the available liquidity.
  function _redeemMaximumWithLoan() internal {
    // amount of liquidity in Venus
    uint256 available = CompleteRToken(rToken).getCash();
    // amount we supplied
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    // amount we borrowed
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 balance = supplied.sub(borrowed);

    _redeemPartialWithLoan(Math.min(available, balance));
    supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    if (supplied > 0) {
      available = CompleteRToken(rToken).getCash();
      _redeemUnderlying(Math.min(available, supplied));
    }
  }

  /// @dev Redeems a set amount of underlying tokens while keeping the borrow ratio healthy.
  function _redeemPartialWithLoan(uint256 amount) internal {
    // amount we supplied
    uint256 supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    // amount we borrowed
    uint256 borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
    uint256 oldBalance = supplied.sub(borrowed);
    uint256 newBalance = oldBalance.sub(amount);
    uint256 newBorrowTarget = newBalance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
    uint256 underlyingBalance;
    while (borrowed > newBorrowTarget) {
      uint256 requiredCollateral = borrowed.mul(factorDenominator).div(collateralFactorNumerator);
      uint256 toRepay = borrowed.sub(newBorrowTarget);
      // redeem just as much as needed to repay the loan
      // supplied - requiredCollateral = max redeemable, amount + repay = needed
      uint256 toRedeem = Math.min(supplied.sub(requiredCollateral), amount.add(toRepay));
      _redeemUnderlying(toRedeem);
      // now we can repay our borrowed amount
      underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
      _repay(Math.min(toRepay, underlyingBalance));
      // update the parameters
      borrowed = CompleteRToken(rToken).borrowBalanceCurrent(address(this));
      supplied = CompleteRToken(rToken).balanceOfUnderlying(address(this));
    }
    underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
    if (underlyingBalance < amount) {
      uint256 toRedeem = amount.sub(underlyingBalance);
      // redeem the most we can redeem
      _redeemUnderlying(toRedeem);
    }
  }
}
