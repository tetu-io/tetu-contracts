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


import "../../../base/strategies/dino/DinoPoolStrategyBase.sol";

contract StrategyDinoPool is DinoPoolStrategyBase {

  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.DINO;
  address private constant _DINO_POOL = address(0x52e7b0C6fB33D3d404b07006b006c8A8D6049C55);
  address private constant _DINO = address(0xAa9654BECca45B5BDFA5ac646c939C62b527D394);
  address[] private _poolRewards = [_DINO];
  address[] private _assets = [_DINO];

  constructor(
    address _controller,
    address _vault,
    address _underlying
  ) DinoPoolStrategyBase(_controller, _underlying, _vault, _poolRewards, _DINO_POOL) {
  }


  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
