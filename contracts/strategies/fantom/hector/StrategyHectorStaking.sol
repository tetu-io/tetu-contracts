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

import "../../../base/strategies/hector/HectorStakingStrategyBase.sol";


contract StrategyHectorStaking is HectorStakingStrategyBase {

  address private constant _HECTOR_STAKING = address(0xD12930C8deeDafD788F437879cbA1Ad1E3908Cc5);
  address private constant _HEC = address(0x5C4FDfc5233f935f20D2aDbA572F770c2E377Ab0);
  address[] private _poolRewards = [_HEC];
  address[] private _assets = [_HEC];

  constructor(
    address _controller,
    address _vault,
    address _underlying
  ) HectorStakingStrategyBase(_controller, _underlying, _vault, _poolRewards, _HECTOR_STAKING) {
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
