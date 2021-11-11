// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Pipe.sol";

import "hardhat/console.sol";

/// @title Unwrapping Pipe Contract
/// @author bogdoslav
contract StartingPipe is Pipe {

    address public token;

    constructor(address _token) Pipe() {
        token = _token;
        sourceToken = _token;
        outputToken = _token;
    }

    /// @dev unwraps WETH
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('StartingPipe put amount', amount);
        console.log('token', token);
        output = amount;

        transferERC20toNextPipe(token, output);
    }

    /// @dev wraps WETH
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('StartingPipe get amount', amount);
        console.log('token', token);
        output = amount;

        transferERC20toPrevPipe(token, output);
    }

    /// @dev available source balance (WETH, WMATIC etc)
    /// @return balance in source units
    function sourceBalance() override public view returns (uint256) {
        return address(this).balance;
    }

    /// @dev underlying balance (ETH, MATIC)
    /// @return balance in underlying units
    function outputBalance() override public view returns (uint256) {
        return address(this).balance;
    }

}
