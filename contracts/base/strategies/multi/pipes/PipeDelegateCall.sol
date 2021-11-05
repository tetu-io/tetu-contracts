// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./Pipe.sol";

import "hardhat/console.sol";


struct PipeSegment {
    Pipe pipe;
    bytes context;
}

/// @title Pipe Delegate Calls Library
/// @author bogdoslav
library PipeDelegateCall {

    /// @dev calls Pipe.init()
    function init(PipeSegment memory segment)
    internal returns (bytes memory context) {
        console.log('before _init call');
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_init(bytes)", segment.context)
        );
        console.log('after _init call success:', success);
        console.log('data.length', data.length);
        if (!success) { revert(_getRevertMsg(data)); }
        context = abi.decode(data, (bytes));
        console.log('context decoded');
    }

    /// @dev calls Pipe.put()
    function put(PipeSegment memory segment, uint256 amount)
    internal returns (uint256 output) {
        console.log('segment.pipe', address(segment.pipe));
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_put(bytes,uint256)", segment.context, amount)
        );
        if (!success) { revert(_getRevertMsg(data)); }
        output = abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.get()
    function get(PipeSegment memory segment, uint256 amount)
    internal returns (uint256 output) {
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_get(bytes,uint256)", segment.context, amount)
        );
        if (!success) { revert(_getRevertMsg(data)); }
        output = abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.rebalance()
    function rebalance(PipeSegment memory segment)
    internal returns (uint256 imbalance, bool deficit){
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_rebalance(bytes)", segment.context)
        );
        if (!success) { revert(_getRevertMsg(data)); }
        (imbalance, deficit) = abi.decode(data, (uint256,bool));
    }

    /// @dev calls Pipe.sourceBalance()
    function sourceBalance(PipeSegment memory segment)
    internal returns (uint256){
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_sourceBalance(bytes)", segment.context)
        );
        if (!success) { revert(_getRevertMsg(data)); }
        return abi.decode(data, (uint256));
    }

    /// @dev calls Pipe.sourceBalance()
    function underlyingBalance(PipeSegment memory segment)
    internal returns (uint256){
        (bool success, bytes memory data) = address(segment.pipe).delegatecall(
            abi.encodeWithSignature("_underlyingBalance(bytes)", segment.context)
        );
        if (!success) { revert(_getRevertMsg(data)); }
        return abi.decode(data, (uint256));
    }

    function _getRevertMsg(bytes memory _returnData)
    private pure returns (string memory) {
        // If the _res length is less than 68, then the transaction failed silently (without a revert message)
        if (_returnData.length < 68) return 'PDC: Delegatecall reverted silently';

        assembly {
        // Slice the sighash.
            _returnData := add(_returnData, 0x04)
        }
        return abi.decode(_returnData, (string)); // All that remains is the revert string
    }
}

