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

import "../StrategyBase.sol";
import "../../../third_party/dino/IEternalPool.sol";

/// @title Abstract contract for Dino Pool strategy implementation
/// @author belbix
abstract contract DinoPoolStrategyBase is StrategyBase {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "DinoPoolStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev 1% buyback
  uint256 private constant _BUY_BACK_RATIO = 1_00;

  /// @notice Pool with rewards
  address public pool;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _pool
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_pool != address(0), "DPS: Zero address pool");
    pool = _pool;
    require(IEternalPool(_pool).DINO() == _underlying, "DPS: Wrong underlying");
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the pool
  /// @return Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256) {
    return IEternalPool(pool).userInfo(address(this)).amount;
  }

  /// @notice Return approximately amount of reward tokens ready to claim in the pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    toClaim[0] = IEternalPool(pool).pendingReward(address(this));
    return toClaim;
  }

  /// @notice TVL of the underlying in the pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(IEternalPool(pool).DINO()).balanceOf(pool);
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    // must invest all underlying before liquidation coz the same asset
    investAllUnderlying();
    IEternalPool(pool).withdraw(0);
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to the Synthetix pool
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(pool, 0);
    IERC20(_underlyingToken).safeApprove(pool, amount);
    IEternalPool(pool).deposit(amount);
  }

  /// @dev Deposit underlying to the Synthetix pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    IEternalPool(pool).withdraw(amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    IEternalPool(pool).emergencyWithdraw();
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    uint toCompound = underlyingBalance() * (_BUY_BACK_DENOMINATOR - _buyBackRatio) / _BUY_BACK_DENOMINATOR;
    depositToPool(toCompound);
    liquidateRewardSilently();
  }

}
