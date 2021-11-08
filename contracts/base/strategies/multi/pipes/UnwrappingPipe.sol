// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Pipe.sol";
import "../../../../third_party/uniswap/IWETH.sol";

import "hardhat/console.sol";

/// @title Unwrapping Pipe Contract
/// @author bogdoslav
contract UnwrappingPipe is Pipe {

    address public WETH;

    constructor(address _WETH) Pipe() {
        WETH = _WETH;
    }

    /// @dev unwraps WETH
    function put(uint256 amount) override onlyOwner public returns (uint256 output) {
        IWETH(WETH).withdraw(amount);
        output = amount;

        if (haveNextPipe()) {
            payable(address(nextPipe)).transfer(output);
        }
    }

    /// @dev wraps WETH
    function get(uint256 amount) override onlyOwner public returns (uint256 output) {
        IWETH(WETH).deposit{value:amount}();
        output = amount;

        transferERC20toPrevPipe(WETH, output);
    }

    /// @dev available source balance (WETH, WMATIC etc)
    /// @return balance in source units
    function sourceBalance() override public view returns (uint256) {
        return ERC20Balance(WETH);
    }

    /// @dev underlying balance (ETH, MATIC)
    /// @return balance in underlying units
    function underlyingBalance() override public view returns (uint256) {
        return address(this).balance;
    }

    /// @dev to receive ETH (MATIC).
    receive() external payable {}

}
