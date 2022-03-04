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

interface IMaiStablecoinPipe {

  function setMaxImbalance(uint256 _maxImbalance) external;

  function maxImbalance() external view returns (uint256);

  function setTargetPercentage(uint256 _targetPercentage) external;

  function targetPercentage() external view returns (uint256);

  function vaultID() external view returns (uint256);

  function borrowToken() external view returns (address);

  function stablecoin() external view returns (address);

  function collateralNumerator() external view returns (uint);

  function collateralPercentage() external view returns (uint256);

  function liquidationPrice() external view returns (uint256);

  function availableMai() external view returns (uint256);

  function maxDeposit() external view returns (uint256);

  }
