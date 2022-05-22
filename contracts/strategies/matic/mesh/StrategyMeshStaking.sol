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

import "../../../base/strategies/mesh/MeshStakingStrategyBase.sol";


contract StrategyMeshStaking is MeshStakingStrategyBase {

  // !!! ONLY CONSTANTS AND DYNAMIC ARRAYS/MAPS !!!
  // push elements to arrays instead of predefine setup
  address private constant _MESH = address(0x82362Ec182Db3Cf7829014Bc61E9BE8a2E82868a);
  address[] private _assets;
  address[] private _poolRewards;

  function initialize(
    address _controller,
    address _vault,
    address _targetRewardVault
  ) external initializer {
    _assets.push(_MESH);
    _poolRewards.push(_MESH);
    MeshStakingStrategyBase.initializeStrategy(_controller, _MESH, _vault, _poolRewards, _targetRewardVault);
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
