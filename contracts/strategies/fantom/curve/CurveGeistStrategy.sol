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
import "../../../third_party/curve/IAavePool.sol";


/// @title Contract for Curve geist strategy implementation
/// @author belbix
contract CurveGeistStrategy is CurveStrategyBase {
  using SafeERC20 for IERC20;

  /// rewards
  address private constant WFTM = address(0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83);
  address private constant CRV = address(0x1E4F97b9f9F913c46F1632781732927B9019C68b);

  address[] private poolRewards = [WFTM, CRV];

  /// deposit tokens
  address private constant DAI = address(0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E);
  address private constant USDC = address(0x04068DA6C83AFCFA0e13ba15A6696662335D5B75);
  address private constant fUSDT = address(0x049d68029688eAbF473097a2fC38ef61633A3C7A);

  /// @notice Curve gauge rewards pool
  address private constant _GAUGE = address(0xd4F94D0aaa640BBb72b5EEc2D85F6D114D81a88E);
  address private constant _POOL = address(0x0fa949783947Bf6c1b171DB13AEACBB488845B3f);

  address[] private _assets = [DAI, USDC, fUSDT];

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
    // use USDC for autocompound
    IERC20(rt).safeApprove(forwarder, 0);
    IERC20(rt).safeApprove(forwarder, toCompound);
    uint amount = IFeeRewardForwarder(forwarder).liquidate(rt, USDC, toCompound);
    require(amount != 0, "CS: Liquidated zero");
    IERC20(USDC).safeApprove(_POOL, 0);
    IERC20(USDC).safeApprove(_POOL, amount);
    // second token is USDC
    IAavePool(_POOL).add_liquidity([0, amount, 0], 0, true);
    // now we have underlying tokens
  }

}
