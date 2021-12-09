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


import "../../../base/strategies/scream/ScreamFoldStrategyBase.sol";

contract StrategyScreamFold is ScreamFoldStrategyBase {

  // SPOOKY_WFTM_SCREAM
  address public constant _SCREAM_LP = address(0x30872e4fc4edbFD7a352bFC2463eb4fAe9C09086);
  address public constant _scWFTM = address(0x5AA53f03197E08C4851CAD8C92c7922DA5857E5d);
  address public constant _SCREAM_CONTROLLER = address(0x260E596DAbE3AFc463e75B6CC05d8c46aCAcFB09);
  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.SCREAM_LEND;
  // rewards
  address private constant SCREAM = address(0xe0654C8e6fd4D733349ac7E09f6f23DA256bF475);
  address[] private _poolRewards = [SCREAM];
  address[] private _assets;

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    address _scToken,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator
  ) ScreamFoldStrategyBase(
    _controller,
    _underlying,
    _vault,
    _poolRewards,
    _scToken,
    _SCREAM_CONTROLLER,
    _borrowTargetFactorNumerator,
    _collateralFactorNumerator,
    _SCREAM_LP,
    _scWFTM
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
