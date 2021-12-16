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

import "../../../base/strategies/curve/CurveStrategyBase.sol";
import "../../../third_party/curve/IRenBTCPool.sol";


/// @title Contract for Curve REN strategy implementation
/// @author Oleg N
contract CurveRenStrategy is CurveStrategyBase {
  using SafeERC20 for IERC20;

  /// rewards
  address private constant WMATIC = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
  address private constant CRV = address(0x172370d5Cd63279eFa6d502DAB29171933a610AF);

  address[] private poolRewards = [WMATIC, CRV];

  /// deposit tokens
  address private constant WBTC = address(0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6);
  address private constant RENBTC = address(0xDBf31dF14B66535aF65AaC99C32e9eA844e14501);

  /// @notice Curve gauge rewards pool
  address private constant _GAUGE = address(0xffbACcE0CC7C19d46132f1258FC16CF6871D153c);
  address private constant _POOL = address(0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67);

  address[] private _assets = [WBTC, RENBTC];

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  constructor(
    address _controller,
    address _underlying,
    address _vault
  ) CurveStrategyBase(_controller, _underlying, _vault, poolRewards, _GAUGE) {}

  /// assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }

  function rtToUnderlying(address rt, uint toCompound) internal override {
    if (toCompound == 0) {
      return;
    }
    address forwarder = IController(controller()).feeRewardForwarder();
    // use WBTC for autocompound
    IERC20(rt).safeApprove(forwarder, 0);
    IERC20(rt).safeApprove(forwarder, toCompound);
    uint amount = IFeeRewardForwarder(forwarder).liquidate(rt, WBTC, toCompound);
    require(amount != 0, "CS: Liquidated zero");
    IERC20(WBTC).safeApprove(_POOL, 0);
    IERC20(WBTC).safeApprove(_POOL, amount);
    // first coin is WBTC
    IRenBTCPool(_POOL).add_liquidity([amount, 0], 0, true);
    // now we have underlying tokens
  }

}
