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


import "../../../base/strategies/iron-fold/IronFoldStrategyBase.sol";

contract StrategyAaveFold is IronFoldStrategyBase {

  // IRON CONTROLLER
  address public constant _IRON_CONTROLLER = address(0xF20fcd005AFDd3AD48C85d0222210fe168DDd10c);
  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.IRON_LEND;
  // rewards
  address private constant ICE = address(0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef);
  address[] private _poolRewards = [ICE];
  address[] private _assets;

  uint256 _FACTOR_DENOMINATOR = 10000;

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    address _rToken,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator
  ) IronFoldStrategyBase(
      _controller,
      _underlying,
      _vault,
      _poolRewards,
      _rToken,
      _IRON_CONTROLLER,
      _borrowTargetFactorNumerator,
      _collateralFactorNumerator,
      _FACTOR_DENOMINATOR
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
