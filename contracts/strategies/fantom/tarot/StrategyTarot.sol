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


import "../../../base/strategies/impermax-base/ImpermaxBaseStrategy.sol";

contract StrategyTarot is ImpermaxBaseStrategy {

  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.TAROT;
  address[] private _assets;

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    address _pool,
    uint __buyBackRatio
  ) ImpermaxBaseStrategy(
    _controller,
    _underlying,
    _vault,
    _pool,
    __buyBackRatio
  ) {
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
