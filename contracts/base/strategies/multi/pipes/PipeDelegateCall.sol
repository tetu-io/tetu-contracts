// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "../pipes/Pipe.sol";

/// @title Pipe Base Contract
/// @author bogdoslav
library PipeDelegateCall {

    string private constant _DELEGATECALL_ERROR = "PL: delegatecall error";

    /// @dev calls Pipe.put()
    function put(Pipe pipe, bytes memory context, uint256 amount)
    internal returns (uint256 output) {
        (bool success, bytes memory data) = address(pipe).delegatecall(
            abi.encodeWithSignature("_put(bytes,uint256)", context, amount)
        );
        require(success, _DELEGATECALL_ERROR);
        output = abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.get()
    function get(Pipe pipe, bytes memory context, uint256 amount)
    internal returns (uint256 output) {
        (bool success, bytes memory data) = address(pipe).delegatecall(
            abi.encodeWithSignature("_get(bytes,uint256)", context, amount)
        );
        require(success, _DELEGATECALL_ERROR);
        output = abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.rebalance()
    function rebalance(Pipe pipe, bytes memory context)
    internal returns (uint256 imbalance, bool deficit){
        (bool success, bytes memory data) = address(pipe).delegatecall(
            abi.encodeWithSignature("_rebalance(bytes)", context)
        );
        require(success, _DELEGATECALL_ERROR);
        (imbalance, deficit) = abi.decode(data, (uint256,bool));
    }

    /// @dev calls Pipe.sourceBalance()
    function sourceBalance(Pipe pipe, bytes memory context)
    internal returns (uint256){
        (bool success, bytes memory data) = address(pipe).delegatecall(
            abi.encodeWithSignature("_sourceBalance(bytes)", context)
        );
        require(success, _DELEGATECALL_ERROR);
        return abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.sourceBalance()
    function underlyingBalance(Pipe pipe, bytes memory context)
    internal returns (uint256){
        (bool success, bytes memory data) = address(pipe).delegatecall(
            abi.encodeWithSignature("_underlyingBalance(bytes)", context)
        );
        require(success, _DELEGATECALL_ERROR);
        return abi.decode(data, (uint256));
    }
}

