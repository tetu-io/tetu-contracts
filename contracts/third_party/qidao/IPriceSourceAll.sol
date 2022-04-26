// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

interface IPriceSourceAll {
	function latestRoundData() external view returns (uint256);
	function latestAnswer() external view returns (uint256);
	function decimals() external view returns (uint8);
}
