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
import "../../../third_party/beethoven/IBeethovenxChef.sol";

/// @title Abstract contract for Beethoven strategy implementation
/// @author OlegN
abstract contract BeethovenACBase is StrategyBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "BeethovenStrategyACBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev 1% buyback
  uint256 private constant _BUY_BACK_RATIO = 100;
  /// @notice MasterChef rewards pool
  address public pool;
  /// @notice MasterChef rewards pool ID
  uint256 public poolId;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _pool,
    uint256 _poolId
  //    bytes32 _underlyingPoolID


  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_pool != address(0), "SSAB: Zero address pool");
    pool = _pool;
    poolId = _poolId;

    //    ISpookyMasterChef.PoolInfo memory poolInfo = ISpookyMasterChef(pool).poolInfo(_poolID);
    //    require(address(poolInfo.lpToken) == _underlyingToken, "SSAB: Wrong underlying");
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the MasterChef pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256) {
    (uint256 _amount,) = IBeethovenxChef(pool).userInfo(poolId, address(this));
    return _amount;
  }

  /// @notice Return approximately amount of reward tokens ready to claim in MasterChef pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    toClaim[0] = IBeethovenxChef(pool).pendingBeets(poolId, address(this));
    return toClaim;
  }

  /// @notice TVL of the underlying in the MasterChef pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(pool);
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override restricted {
    //        investAllUnderlying();
    //        withdrawAndClaimFromPool(0);
    //        liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to MasterChef pool
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(pool, 0);
    IERC20(_underlyingToken).safeApprove(pool, amount);
    IBeethovenxChef(pool).deposit(poolId, amount, address(this));
  }

  /// @dev Withdraw underlying from MasterChef pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint256 amount) internal override {
//    ISpookyMasterChef(pool).withdraw(poolID, amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
//    ISpookyMasterChef(pool).emergencyWithdraw(poolID);
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
//    autocompoundLP(router);
//    // if we have not enough balance for buybacks we will autocompound 100%
//    liquidateRewardSilently();
  }

}
