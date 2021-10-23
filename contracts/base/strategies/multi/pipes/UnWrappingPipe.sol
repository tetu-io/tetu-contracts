// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "./Pipe.sol";
import "../../../../third_party/uniswap/IWETH.sol";

/// @title UnWrapping Pipe Contract
/// @author bogdoslav
contract UnWrappingPipe is Pipe {
    /// @dev creates context
    function create(address WETH) public pure returns (bytes memory){
        return abi.encode(WETH);
    }

    /// @dev decodes context
    function context(bytes memory c) internal pure returns (address WETH) {
      (WETH) = abi.decode(c, (address));
    }

    /// @dev function for investing, deposits, entering, borrowing
    function put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address WETH) = context(c);
        IWETH(WETH).deposit{value:amount}();
        output = amount;
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    function get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address WETH) = context(c);
        IWETH(WETH).withdraw(amount);
        output = amount;
    }

}
