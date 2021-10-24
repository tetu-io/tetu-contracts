// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "../pipes/Pipe.sol";
import "./Pipeline.sol";


/// @title Pipe Base Contract
/// @author bogdoslav
contract LinearPipeline is Pipeline {

    struct PipeSegment {
        Pipe pipe;
        bytes context;
    }

    PipeSegment[] public pipes;

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    function pumpIn(uint256 amount) internal override {
        uint256 lastOutput = amount;
        uint256 len = pipes.length;
        for (uint256 i=0; i<len; i++) {
            PipeSegment storage segment = pipes[i];
            lastOutput = pipePut(segment.pipe, segment.context, lastOutput);
        }
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in source units
    function pumpOut(uint256 amount) internal override {
        uint256 lastOutput = amount; //TODO convert from source to most underlying
        uint256 len = pipes.length;
        for (uint256 i=len-1; i<=0; i--) {
            PipeSegment storage segment = pipes[i];
            lastOutput = pipeGet(segment.pipe, segment.context, lastOutput);
        }
    }

    /// @dev calls work for all pipe segments
    function work() internal override {
        uint256 len = pipes.length;
        for (uint256 i=0; i<len; i++) {
            PipeSegment storage segment = pipes[i];
            pipeWork(segment.pipe, segment.context);
        }
    }
}
