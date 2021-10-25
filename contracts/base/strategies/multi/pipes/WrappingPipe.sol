// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "./Pipe.sol";
import "../../../../third_party/uniswap/IWETH.sol";

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract WrappingPipe is Pipe {
    /// @dev creates context
    function create(address WETH) public pure returns (bytes memory){
        return abi.encode(WETH);
    }

    /// @dev decodes context
    function context(bytes memory c) internal pure returns (address WETH) {
      (WETH) = abi.decode(c, (address));
    }

    /// @dev function for investing, deposits, entering, borrowing
    function _put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address WMATIC) = context(c);
        IWETH(WMATIC).deposit{value:amount}();
        output = amount;
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    function _get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address WMATIC) = context(c);
        IWETH(WMATIC).withdraw(amount);
        output = amount;
    }

}
