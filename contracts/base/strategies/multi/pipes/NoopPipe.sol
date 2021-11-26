// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "./Pipe.sol";

import "hardhat/console.sol";

/// @title No operation Pipe Contract
/// @author bogdoslav
contract NoopPipe is Pipe {
    using SafeERC20 for IERC20;

    constructor(address token) Pipe() {
        name = 'NoopPipe';
        sourceToken = token;
        outputToken = token;
    }

    /// @dev Just send to next pipe
    /// @param amount to transfer
    /// @return output amount of output token
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('NoopPipe put amount', amount);
        output = ERC20Balance(outputToken);
        transferERC20toNextPipe(outputToken, output);
    }

    /// @dev Just send to prev pipe
    /// @param amount to transfer
    /// @return output amount of source token
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('NoopPipe get amount', amount);
        output = ERC20Balance(sourceToken);
        transferERC20toPrevPipe(sourceToken, output);
    }

}
