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

/// @title AAVE->MAI->BAL Multi Strategy Interface
/// @author belbix, bogdoslav
interface IAaveMaiBalStrategyBase {
  function totalAmountOut() external view returns (uint256);

  function targetPercentage() external view returns (uint256);

  function maxImbalance() external view returns (uint256);

  function collateralPercentage() external view returns (uint256);

  function liquidationPrice() external view returns (uint256 price);

  function availableMai() external view returns (uint256);

  function maxDeposit() external view returns (uint256 max);

  // ***************************************
  // ************** GOVERNANCE ACTIONS *****
  // ***************************************

  function salvageFromPipeline(address recipient, address token) external;

  function rebalanceAllPipes() external;

  function setTargetPercentage(uint256 _targetPercentage) external;

  function setMaxImbalance(uint256 _maxImbalance) external;

}
