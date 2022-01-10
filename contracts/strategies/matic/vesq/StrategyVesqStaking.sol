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

import "../../../base/strategies/vesq/VesqStakingStrategyBase.sol";


contract StrategyVesqStaking is VesqStakingStrategyBase {

  address private constant _VESQ_STAKING = address(0x2F3E9e54bD4513D1B49A6d915F9a83310638CFC2);
  address private constant _VSQ = address(0x29F1e986FCa02B7E54138c04C4F503DdDD250558);
  address[] private _poolRewards = [_VSQ];
  address[] private _assets = [_VSQ];

  constructor(
    address _controller,
    address _vault,
    address _underlying
  ) VesqStakingStrategyBase(_controller, _underlying, _vault, _poolRewards, _VESQ_STAKING) {
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
