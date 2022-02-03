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

interface IFoldStrategy {

  function borrowTargetFactorNumeratorStored() external view returns (uint);

  function borrowTargetFactorNumerator() external view returns (uint);

  function collateralFactorNumerator() external view returns (uint);

  function fold() external view returns (bool);

  function foldState() external view returns (uint);

  function suppliedInUnderlying() external view returns (uint);

  function borrowedInUnderlying() external view returns (uint);

  function isFoldingProfitable() external view returns (bool);

  function setFold(uint value) external;

  function rebalance() external;

  function setBorrowTargetFactorNumeratorStored(uint value) external;

  function stopFolding() external;

  function startFolding() external;

  function setCollateralFactorNumerator(uint value) external;

}
