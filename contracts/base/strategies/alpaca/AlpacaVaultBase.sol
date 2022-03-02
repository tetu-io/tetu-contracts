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

import "../../../third_party/alpaca/IAlpacaVault.sol";
import "../../../third_party/alpaca/IFairLaunch.sol";
import "../../../third_party/uniswap/IWETH.sol";

import "../StrategyBase.sol";


/// @title Abstract contract for AlpacaVault strategy implementation
/// @author olegn
abstract contract AlpacaVaultBase is StrategyBase{
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "AlpacaVaultBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev 10% buyback
  uint private constant _BUY_BACK_RATIO = 1000;
  IAlpacaVault private alpacaVault;
  IFairLaunch private fairLaunchPool;
  uint private poolID;

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
    fairLaunchPool = IFairLaunch(_fairLaunch);
    poolID = _poolId;
    require(alpacaVault.token() == _underlyingToken, "Wrong underlying");
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the fairLaunch pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint) {
    uint totalSupply = alpacaVault.totalSupply();
    uint totalToken = alpacaVault.totalToken();
    (uint amount,) = fairLaunchPool.userInfo(poolID, address(this));
    uint balance = amount * totalToken / totalSupply;
    return balance;
  }

  /// @notice Return approximately amount of reward tokens ready to claim in fairLaunch pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint[] memory) {
    uint[] memory toClaim = new uint[](1);
    toClaim[0] = fairLaunchPool.pendingAlpaca(poolID, address(this));
    return toClaim;
  }

  /// @notice TVL of the underlying in the fairLaunch pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint) {
    uint totalSupply = alpacaVault.totalSupply();
    uint totalToken = alpacaVault.totalToken();
    uint fairLaunchPoolBalance = IERC20(address(alpacaVault)).balanceOf(address(fairLaunchPool));
    return fairLaunchPoolBalance  * totalToken / totalSupply;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    investAllUnderlying();
    fairLaunchPool.harvest(poolID);
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to alpaca vault and stake ib tokens at fairLaunch pool
  /// @param amount Deposit amount
  function depositToPool(uint amount) internal override {
    if(amount > 0){
      address alpacaVaultAddress = address(alpacaVault);
      address fairLaunchAddress = address(fairLaunchPool);

      IERC20(_underlyingToken).safeApprove(alpacaVaultAddress, 0);
      IERC20(_underlyingToken).safeApprove(alpacaVaultAddress, amount);
      alpacaVault.deposit(amount);

      uint ibTokenBalance =  IERC20(alpacaVaultAddress).balanceOf(address(this));
      IERC20(alpacaVaultAddress).safeApprove(fairLaunchAddress, 0);
      IERC20(alpacaVaultAddress).safeApprove(fairLaunchAddress, ibTokenBalance);

      fairLaunchPool.deposit(address(this), poolID, ibTokenBalance);
    }
  }

  /// @dev Withdraw underlying from TShareRewardPool pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint amount) internal override {
    fairLaunchPool.harvest(poolID);

    uint totalSupply = alpacaVault.totalSupply();
    uint totalToken = alpacaVault.totalToken();

    (uint userBal,) = fairLaunchPool.userInfo(poolID, address(this));
    uint toWithdraw = amount * totalSupply / totalToken + 1;

    toWithdraw = Math.min(userBal, toWithdraw);

    fairLaunchPool.withdraw(address(this), poolID, toWithdraw);
    uint ibTokenBalance =  IERC20(address(alpacaVault)).balanceOf(address(this));

    alpacaVault.withdraw(ibTokenBalance);
    uint ftmBal = address(this).balance;

    if (ftmBal > 0) {
      IWETH(_underlyingToken).deposit{value: ftmBal}();
    }
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    fairLaunchPool.emergencyWithdraw(poolID);
    uint ibTokenBalance =  IERC20(address(alpacaVault)).balanceOf(address(this));
    alpacaVault.withdraw(ibTokenBalance);
    uint ftmBal = address(this).balance;
    if (ftmBal > 0) {
      IWETH(_underlyingToken).deposit{value: ftmBal}();
    }
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    autocompound();
    liquidateRewardDefault();
  }

  // this is needed as alpacaVault.withdraw returns native tokens for FTM
  receive() external payable {}
}
