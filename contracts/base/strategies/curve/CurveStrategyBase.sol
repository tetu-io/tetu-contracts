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

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../../third_party/curve/IGauge.sol";
import "../../../third_party/curve/ICurveMinter.sol";
import "../../../third_party/curve/ICurveLpToken.sol";
import "../../../base/strategies/StrategyBase.sol";
import "../../interface/strategies/ICurveStrategy.sol";


/// @title Contract for Curve strategy implementation
/// @author Oleg N
/// @author belbix
abstract contract CurveStrategyBase is StrategyBase, ICurveStrategy {
  using SafeERC20 for IERC20;

  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.CURVE;

  // ************ VARIABLES **********************

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.3";
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "CurveStrategyBase";

  /// @dev 1% buyback
  uint256 private constant _BUY_BACK_RATIO = 100;

  /// @notice Curve gauge rewards pool
  address public override gauge;

  /// @notice Contract constructor using on strategy implementation
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _gauge
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    gauge = _gauge;
    address lpToken = IGauge(gauge).lp_token();
    require(lpToken == _underlyingToken, "wrong underlying");
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the Gauge pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256 bal) {
    bal = IGauge(gauge).balanceOf(address(this));
  }

  /// @notice Return approximately amount of reward tokens ready to claim in Gauge pool
  /// @dev Don't use it in any internal logic, only for statistical purposes. 
  /// To get the result need to call claimable_reward_write from Gauge contract first, 
  /// otherwise returns 0
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      toClaim[i] = IGauge(gauge).claimable_reward(address(this), _rewardTokens[i]);
    }
    return toClaim;
  }

  /// @notice TVL of the underlying in the curve gauge pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(gauge);
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    investAllUnderlying();
    IGauge(gauge).claim_rewards(address(this));
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to Gauge pool
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(gauge, 0);
    IERC20(_underlyingToken).safeApprove(gauge, amount);
    IGauge(gauge).deposit(amount);
  }

  /// @dev Withdraw underlying and reward from Gauge pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    IGauge(gauge).withdraw(amount, true);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    IGauge(gauge).withdraw(rewardPoolBalance(), false);
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    autocompoundCurve();
    liquidateRewardSilently();
  }

  /// @dev Liquidate rewards, buy assets and add to curve gauge
  function autocompoundCurve() internal {
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      uint256 amount = rewardBalance(i);
      if (amount != 0) {
        uint toCompound = amount * (_BUY_BACK_DENOMINATOR - _buyBackRatio) / _BUY_BACK_DENOMINATOR;
        address rt = _rewardTokens[i];
        rtToUnderlying(rt, toCompound);
      }
    }
  }

  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }

  /// @dev Need to create a correct implementation for each pool
  function rtToUnderlying(address rt, uint toCompound) internal virtual;
}
