// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface IScreamController {

    function claimComp(address holder, address[] memory cTokens) external;

    function compAccrued(address account) external view returns (uint);

    function compSpeeds(address scToken) external view returns (uint);

    function supplyCaps(address scToken) external view returns (uint);

    function oracle() external view returns (address);

    function getAllMarkets() external view returns (address[] memory);

    function markets(address rToken) external view returns (bool isListed, uint collateralFactorMantissa);
}
