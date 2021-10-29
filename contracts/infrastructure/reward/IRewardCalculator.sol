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

interface IRewardCalculator {

  event ToolAddressUpdated(string name, address newValue);

  function getPrice(address _token) external view returns (uint256);

  function strategyRewardsUsd(address _strategy, uint256 _period) external view returns (uint256);

  function rewardsPerTvl(address _vault, uint256 _period) external view returns (uint256);

  function vaultTVLRatio(address _vault) external view returns (uint256);

  function kpi(address _vault) external view returns (uint256);

  function vaultLastTetuReward(address _vault) external view returns (uint256);

  function strategyEarnedSinceLastDistribution(address strategy)
  external view returns (uint256 earned, uint256 lastEarnedTs);

}
