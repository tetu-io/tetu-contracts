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
import "../../../third_party/alpaca/IAlpacaVault.sol";
import "../../../third_party/alpaca/IFairLaunch.sol";

import "hardhat/console.sol";


/// @title Abstract contract for AlpacaVault strategy implementation
/// @author olegn
abstract contract AlpacaVaultBase is StrategyBase{
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "AlpacaVaultBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint private constant _BUY_BACK_RATIO = 1000;
  IAlpacaVault private alpacaVault;
  IFairLaunch private fairLaunch;
  uint private poolId;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _vault SmartVault address that will provide liquidity
  /// @param _underlying Underlying token address
  /// @param __rewardTokens Reward tokens that the strategy will farm
  /// @param _alpacaVault AlpacaVault address
  /// @param _fairLaunch FairLaunch address
  /// @param _poolId alpaca Pool id
  constructor(
    address _controller,
    address _vault,
    address _underlying,
    address[] memory __rewardTokens,
    address _alpacaVault,
    address _fairLaunch,
    uint _poolId
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    alpacaVault = IAlpacaVault(_alpacaVault);
    fairLaunch = IFairLaunch(_fairLaunch);
    poolId = _poolId;
    console.log("_alpacaVault %s", _alpacaVault);
    console.log("_fairLaunch %s", _fairLaunch);
    console.log("_poolId %s", _poolId);
    console.log("token %s", _poolId);
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the TShareRewardPool pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint) {
//    return tShareRewardPool.userInfo(poolID, address(this)).amount;
    return 42;
  }

  /// @notice Return approximately amount of reward tokens ready to claim in TShareRewardPool pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint[] memory) {
    uint[] memory toClaim = new uint[](1);
//    toClaim[0] = tShareRewardPool.pendingShare(poolID, address(this));
    return toClaim;

  }

  /// @notice TVL of the underlying in the TShareRewardPool pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint) {
//    return IERC20(_underlyingToken).balanceOf(address(tShareRewardPool));
      return 42;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
//    depositToPool(IERC20(_underlyingToken).balanceOf(address(this)));
//    withdrawAndClaimFromPool(0);
//    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to alpaca vault and stake ib tokens at fairLaunch pool
  /// @param amount Deposit amount
  function depositToPool(uint amount) internal override {
    IERC20(_underlyingToken).safeApprove(address(alpacaVault), 0);
    IERC20(_underlyingToken).safeApprove(address(alpacaVault), amount);
    alpacaVault.deposit(amount);
    uint ibTokenBalance =  IERC20(address(alpacaVault)).balanceOf(address(this));
    fairLaunch.deposit(address(this), ibTokenBalance, poolId);
  }

  /// @dev Withdraw underlying from TShareRewardPool pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint amount) internal override {
//    tShareRewardPool.withdraw(poolID, amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
//    tShareRewardPool.emergencyWithdraw(poolID);
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
//    liquidateRewardDefault();
  }

}
