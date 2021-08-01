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


import "../../../base/strategies/curve/CurveAaveStrategyFullBuyback.sol";

contract StrategyCurveAave is CurveAaveStrategyFullBuyback {

  address public constant AAVE_GAUGE = address(0x19793B454D3AfC7b454F206Ffe95aDE26cA6912c);
  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.CURVE;
  // rewards
  address private constant WMATIC = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
  address private constant CRV = address(0x172370d5Cd63279eFa6d502DAB29171933a610AF);

  address[] private poolRewards = [WMATIC, CRV];
  address[] private _assets;

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    uint256 _poolId
  ) CurveAaveStrategyFullBuyback(_controller, _underlying, _vault, poolRewards, AAVE_GAUGE, _poolId) {
    require(_underlying != address(0), "zero underlying");
    _assets.push(_underlying);
  }

  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
