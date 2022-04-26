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

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../StrategyBase.sol";
import "../../../third_party/cosmic/ICosmicMasterChef.sol";

/// @title Abstract contract for Cosmic strategy implementation
/// @author belbix
abstract contract CosmicStrategyBase is StrategyBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "CosmicStrategyFullBuyback";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.2";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;

  /// @notice MasterChef rewards pool
  address public masterChefPool;
  /// @notice MasterChef rewards pool ID
  uint256 public poolID;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  /// @param __rewardTokens Reward tokens that the strategy will farm
  /// @param _pool MasterChef address
  /// @param _poolID Pool id
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _pool,
    uint256 _poolID
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_pool != address(0), "zero address pool");
    masterChefPool = _pool;
    poolID = _poolID;

    ICosmicMasterChef.PoolInfo memory poolInfo = ICosmicMasterChef(_pool).poolInfo(_poolID);
    require(poolInfo.lpToken == _underlyingToken, "wrong underlying");
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the MasterChef pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256) {
    return ICosmicMasterChef(masterChefPool).userInfo(poolID, address(this)).amount;
  }

  /// @notice Return approximately amount of reward tokens ready to claim in MasterChef pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    toClaim[0] = ICosmicMasterChef(masterChefPool).pendingCosmic(poolID, address(this));
    return toClaim;
  }

  /// @notice TVL of the underlying in the MasterChef pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(masterChefPool);
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    withdrawAndClaimFromPool(rewardPoolBalance());
    liquidateReward();
    depositToPool(IERC20(_underlyingToken).balanceOf(address(this)));
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to MasterChef pool
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(masterChefPool, 0);
    IERC20(_underlyingToken).safeApprove(masterChefPool, amount);
    ICosmicMasterChef(masterChefPool).deposit(poolID, amount, address(0));
  }

  /// @dev Withdraw underlying from MasterChef pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    ICosmicMasterChef(masterChefPool).withdraw(poolID, amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    ICosmicMasterChef(masterChefPool).emergencyWithdraw(poolID);
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

}
