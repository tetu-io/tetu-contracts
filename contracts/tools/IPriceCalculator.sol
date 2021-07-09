//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

interface IPriceCalculator {

  function getPrice(address token, address outputToken) external view returns (uint256);

  function getPriceWithDefaultOutput(address token) external view returns (uint256);

}
