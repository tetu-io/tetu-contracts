// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Pipe.sol";
import "../../../../third_party/uniswap/IWETH.sol";

import "hardhat/console.sol";

/// @title Unwrapping Pipe Contract
/// @author bogdoslav
contract UnwrappingPipe is Pipe {

    constructor(address _WETH) Pipe() {
        name = 'UnwrappingPipe';
        sourceToken = _WETH;
        outputToken = _ETHER;
    }

    /// @dev unwraps WETH
    /// @param amount to unwrap
    /// @return output amount of output units
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('UnwrappingPipe put amount', amount);
        console.log('sourceToken (WETH)', sourceToken);
        console.log('sourceBalance()', sourceBalance());
        IWETH(sourceToken).withdraw(amount);
        output = address(this).balance;

        if (haveNextPipe()) {
            payable(address(nextPipe)).transfer(output);
        }
    }

    /// @dev wraps WETH back
    /// @param amount to wrap
    /// @return output amount of source units
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('UnwrappingPipe get amount', amount);
        IWETH(sourceToken).deposit{value:amount}();
        output = ERC20Balance(sourceToken);
        transferERC20toPrevPipe(sourceToken, output);
    }

    /// @dev underlying balance (ETH, MATIC)
    /// @return balance in underlying units
    function outputBalance() override public view returns (uint256) {
        return address(this).balance;
    }

    /// @dev to receive ETH (MATIC).
    receive() external payable {}

}
