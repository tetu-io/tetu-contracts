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
import "../../../base/strategies/StrategyBase.sol";


/// @title Contract for Curve strategy implementation
/// @author Oleg N
abstract contract CurveStrategyFullBuyback is StrategyBase{
  
  using SafeERC20 for IERC20;

  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.CURVE;

  // ************ VARIABLES **********************

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;

  /// @notice Curve gauge rewards pool
  address public gague;


  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  /// @param __rewardTokens Reward tokens that the strategy will farm
  /// @param _gague Gague reward pool address

  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _gague
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    gague = _gague; 
    address lpToken = IGauge(gague).lp_token();
    require(lpToken == _underlyingToken, "wrong underlying");
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the Gauge pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256 bal) {
    bal = IGauge(gague).balanceOf(address(this));
  }

  /// @notice Return approximately amount of reward tokens ready to claim in Gauge pool
  /// @dev Don't use it in any internal logic, only for statistical purposes. 
  /// To get the result need to call claimable_reward_write from Gauge contract first, 
  /// otherwise returns 0
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      toClaim[i] = IGauge(gague).claimable_reward(address(this), _rewardTokens[i]);  
    }
    return toClaim;
  }

  /// @notice TVL of the underlying in the curve gauge pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(gague);
  }

  /// @notice Hard to calculate for Curve.
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return []
  function poolWeeklyRewardsAmount() external pure override returns (uint256[] memory) {
    uint256[] memory dummyResult = new uint256[](1);
    return dummyResult;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override restricted {
    IGauge(gague).claim_rewards(address(this));
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to Gauge pool
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(gague, 0);
    IERC20(_underlyingToken).safeApprove(gague, amount);
    IGauge(gague).deposit(amount);
  }

  /// @dev Withdraw underlying and reward from Gauge pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    IGauge(gague).withdraw(amount, true);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    IGauge(gague).withdraw(rewardPoolBalance(), false);
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }
}
