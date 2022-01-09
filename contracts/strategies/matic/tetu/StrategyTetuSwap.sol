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

import "../../../base/strategies/tetu/TetuSwapStrategyBase.sol";

contract StrategyTetuSwap is TetuSwapStrategyBase {
  using SafeERC20 for IERC20;

  address public constant X_TETU = address(0x225084D30cc297F3b177d9f93f5C3Ab8fb6a1454);
  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.TETU_SWAP;
  // rewards
  address[] private _rewards = [X_TETU];
  address[] private _assets;

  constructor(
    address _controller,
    address _vault,
    address _underlying
  ) TetuSwapStrategyBase(_controller, _underlying, _vault, _rewards) {
    require(_underlying != address(0), "zero underlying");
    _assets.push(ITetuSwapPair(_underlying).token0());
    _assets.push(ITetuSwapPair(_underlying).token1());
  }

  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    // assume only xTetu rewards exist
    address rt = IController(controller()).psVault();

    // it is redirected rewards - PS already had their part of income
    // in case of pair with xTETU-XXX we not able to separate it
    uint256 amount = IERC20(rt).balanceOf(address(this));
    if (amount > 0) {
      IERC20(rt).safeApprove(_smartVault, 0);
      IERC20(rt).safeApprove(_smartVault, amount);
      ISmartVault(_smartVault).notifyTargetRewardAmount(rt, amount);
    }
    // if no not enough fees for buybacks it should not ruin hardwork process
    liquidateRewardSilently();
  }
}
