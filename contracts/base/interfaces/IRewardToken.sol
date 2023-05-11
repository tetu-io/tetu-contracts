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

interface IRewardToken {

  function MINTING_PERIOD() external view returns (uint256);

  function HARD_CAP() external view returns (uint256);

  function startMinting() external;

  function mint(address to, uint256 amount) external;

  function currentWeek() external view returns (uint256);

  function maxTotalSupplyForCurrentBlock() external view returns (uint256);

  function _log2(uint256 x) external pure returns (uint256 result);

}
