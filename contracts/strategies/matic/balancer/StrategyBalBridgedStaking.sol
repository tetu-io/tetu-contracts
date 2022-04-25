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

import "../../../base/strategies/balancer/BalBridgedStakingStrategyBase.sol";

contract StrategyBalBridgedStaking is BalBridgedStakingStrategyBase {

  // !!! ONLY CONSTANTS AND DYNAMIC ARRAYS/MAPS !!!
  // push elements to arrays instead of predefine setup
  address private constant _BAL_ETH_POOL = 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f;
  address[] private _assets;
  address[] private _poolRewards;

  function initialize(
    address controller_,
    address vault_,
    address sender_
  ) external initializer {
    _assets.push(_BAL);
    _assets.push(_WETH);
    _poolRewards.push(_BAL);
    BalBridgedStakingStrategyBase.initializeStrategy(controller_, _BAL_ETH_POOL, vault_, _poolRewards, sender_);
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
