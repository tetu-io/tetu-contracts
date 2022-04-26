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
import "../../../third_party/synthetix/SNXRewardInterface.sol";
import "../../../third_party/quick/IDragonLair.sol";

/// @title Abstract contract for Quick Swap strategy implementation
/// @author belbix
abstract contract QuickStrategyBaseAC is StrategyBase {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "QuickStrategyBaseAC";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.2";
  /// @dev 10% buyback
  uint256 private constant _BUY_BACK_RATIO = 10_00;
  address public constant QUICK = address(0x831753DD7087CaC61aB5644b308642cc1c33Dc13);
  address public constant D_QUICK = address(0xf28164A485B0B2C90639E47b0f377b4a438a16B1);
  address[] private quickPoolRewards = [QUICK];

  /// @notice Synthetix like pool with rewards
  SNXRewardInterface public rewardPool;
  /// @notice Uniswap router for underlying LP
  address public router;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address _rewardPool,
    address _router
  ) StrategyBase(_controller, _underlying, _vault, quickPoolRewards, _BUY_BACK_RATIO) {
    require(_rewardPool != address(0), "zero address pool");
    rewardPool = SNXRewardInterface(_rewardPool);
    require(rewardPool.stakingToken() == _underlying, "wrong underlying");
    router = _router;

    _unsalvageableTokens[D_QUICK] = true;
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the Synthetix pool
  /// @return Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256) {
    return rewardPool.balanceOf(address(this));
  }

  /// @notice Return approximately amount of reward tokens ready to claim in the Synthetix pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    toClaim[0] = rewardPool.earned(address(this));
    return toClaim;
  }

  /// @notice TVL of the underlying in the Synthetix pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return rewardPool.totalSupply();
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    investAllUnderlying();
    rewardPool.getReward();
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to the Synthetix pool
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(address(rewardPool), 0);
    IERC20(_underlyingToken).safeApprove(address(rewardPool), amount);
    rewardPool.stake(amount);
  }

  /// @dev Deposit underlying to the Synthetix pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    rewardPool.withdraw(amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    rewardPool.exit();
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    uint256 dQuickBalance = IERC20(D_QUICK).balanceOf(address(this));
    if (dQuickBalance == 0) {
      return;
    }
    IDragonLair(D_QUICK).leave(dQuickBalance);
    autocompoundLP(router);
    // if we have not enough balance for buybacks we will autocompound 100%
    liquidateRewardSilently();
  }

}
