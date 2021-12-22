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
import "../../../third_party/curve/ITricryptoPoolFtm.sol";


/// @title Contract for Curve atricrypto3 strategy implementation
/// @author belbix
contract CurveTriCryptoFtmStrategy is CurveStrategyBase {
  using SafeERC20 for IERC20;

  /// rewards
  address private constant WFTM = address(0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83);
  address private constant CRV = address(0x1E4F97b9f9F913c46F1632781732927B9019C68b);

  address[] private poolRewards = [WFTM, CRV];

  /// deposit tokens
  address private constant fUSDT = address(0x049d68029688eAbF473097a2fC38ef61633A3C7A);
  address private constant WBTC = address(0x321162Cd933E2Be498Cd2267a90534A804051b11);
  address private constant WETH = address(0x74b23882a30290451A17c44f4F05243b6b58C76d);

  address private constant _GAUGE = address(0x00702BbDEaD24C40647f235F15971dB0867F6bdB);
  address private constant _POOL = address(0x3a1659Ddcf2339Be3aeA159cA010979FB49155FF);

  address[] private _assets = [fUSDT, WBTC, WETH];

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
    // use fUSDT for autocompound
    IERC20(rt).safeApprove(forwarder, 0);
    IERC20(rt).safeApprove(forwarder, toCompound);
    uint amount = IFeeRewardForwarder(forwarder).liquidate(rt, fUSDT, toCompound);
    require(amount != 0, "CS: Liquidated zero");
    IERC20(fUSDT).safeApprove(_POOL, 0);
    IERC20(fUSDT).safeApprove(_POOL, amount);
    // second token is USDC
    ITricryptoPoolFtm(_POOL).add_liquidity([amount, 0, 0], 0);
    // now we have underlying tokens
  }

}
