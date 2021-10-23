// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

/// @title Pipe Base Contract
/// @author bogdoslav
abstract contract Pipe {

    /// See ./WrappingPipe.sol for working context example
    /// dev create context from desired parameters
    //function create(...) public pure returns (bytes memory)
    /// dev decode context to variables
    //function context(bytes memory c) private pure returns (...)

    /// @dev function for investing, deposits, entering, borrowing
    /// @param c abi-encoded context
    /// @param amount in source units
    /// @return output in underlying units
    function put(bytes memory c, uint256 amount) virtual public returns (uint256 output);

    /// @dev function for de-vesting, withdrawals, leaves, paybacks. Amount in underlying units
    /// @param c abi-encoded context
    /// @param amount in underlying units
    /// @return output in source units
    function get( bytes memory c, uint256 amount) virtual public returns (uint256 output);

    /// @dev function for hardwork, claiming rewards, balancing
    /// @param c abi-encoded context
    function work( bytes memory c) virtual public {
        // do nothing by default
    }
}
