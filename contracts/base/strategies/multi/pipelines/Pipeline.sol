// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "../pipes/Pipe.sol";

/// @title Pipe Base Contract
/// @author bogdoslav
abstract contract Pipeline {

    string private constant _DELEGATECALL_ERROR = "PL: delegatecall error";

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    function pumpIn(uint256 amount) virtual internal;

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in source units
    function pumpOut(uint256 amount) virtual internal;

    /// @dev calls work for all pipe segments
    function work() virtual internal;

    /// @dev calls Pipe.put()
    function pipePut(Pipe pipe, bytes memory context, uint256 amount)
    internal returns (uint256 output) {
        (bool success, bytes memory data) = address(pipe).delegatecall(
            abi.encodeWithSignature("put(bytes,uint256)", context, amount)
        );
        require(success, _DELEGATECALL_ERROR);
        output = abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.get()
    function pipeGet(Pipe pipe, bytes memory context, uint256 amount)
    internal returns (uint256 output) {
        (bool success, bytes memory data) = address(pipe).delegatecall(
            abi.encodeWithSignature("get(bytes,uint256)", context, amount)
        );
        require(success, _DELEGATECALL_ERROR);
        output = abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.work()
    function pipeWork(Pipe pipe, bytes memory context)
    internal {
        (bool success,) = address(pipe).delegatecall(
            abi.encodeWithSignature("work(bytes)", context)
        );
        require(success, _DELEGATECALL_ERROR);
    }
}
