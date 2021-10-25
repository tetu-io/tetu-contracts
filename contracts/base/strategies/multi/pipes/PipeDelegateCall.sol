// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./Pipe.sol";

struct PipeSegment {
    Pipe pipe;
    bytes context;
}

/// @title Pipe Delegate Calls Library
/// @author bogdoslav
library PipeDelegateCall {

    string private constant _DELEGATECALL_ERROR = "PL: delegatecall error";

    /// @dev calls Pipe.put()
    function put(PipeSegment memory segment, uint256 amount)
    internal returns (uint256 output) {
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_put(bytes,uint256)", segment.context, amount)
        );
        require(success, _DELEGATECALL_ERROR);
        output = abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.get()
    function get(PipeSegment memory segment, uint256 amount)
    internal returns (uint256 output) {
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_get(bytes,uint256)", segment.context, amount)
        );
        require(success, _DELEGATECALL_ERROR);
        output = abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.rebalance()
    function rebalance(PipeSegment memory segment)
    internal returns (uint256 imbalance, bool deficit){
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_rebalance(bytes)", segment.context)
        );
        require(success, _DELEGATECALL_ERROR);
        (imbalance, deficit) = abi.decode(data, (uint256,bool));
    }

    /// @dev calls Pipe.sourceBalance()
    function sourceBalance(PipeSegment memory segment)
    internal returns (uint256){
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_sourceBalance(bytes)", segment.context)
        );
        require(success, _DELEGATECALL_ERROR);
        return abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.sourceBalance()
    function underlyingBalance(PipeSegment memory segment)
    internal returns (uint256){
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_underlyingBalance(bytes)", segment.context)
        );
        require(success, _DELEGATECALL_ERROR);
        return abi.decode(data, (uint256));
    }
}

