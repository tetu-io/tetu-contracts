// SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

interface IUniswapV2Migrator {
    function migrate(address token, uint amountTokenMin, uint amountETHMin, address to, uint deadline) external;
}
