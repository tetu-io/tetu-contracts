// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../pipes/Pipe.sol";
import "../pipes/PipeDelegateCall.sol";


/// @title Pipe Base Contract
/// @author bogdoslav
contract LinearPipeline {
    using SafeMath for uint256;
    using PipeDelegateCall for Pipe;

    struct PipeSegment {
        Pipe pipe;
        bytes context;
    }

    PipeSegment[] public pipes;

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    function pumpIn(uint256 amount, uint256 fromPipeIndex) internal  {
        uint256 lastOutput = amount;
        uint256 len = pipes.length;
        for (uint256 i= fromPipeIndex; i<len; i++) {
            PipeSegment storage segment = pipes[i];
            lastOutput = segment.pipe.put(segment.context, lastOutput);
        }
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in source units
    function pumpOut(uint256 amount, uint256 toPipeIndex)
    internal returns (uint256 amountOut) {
        amountOut = amount; //TODO convert from source to most underlying
        uint256 len = pipes.length;
        for (uint256 i=len-1; i>= toPipeIndex; i--) {
            PipeSegment storage segment = pipes[i];
            amountOut = segment.pipe.get(segment.context, amountOut);
        }
    }

    function getAmountOut(uint256 amountIn, uint256 toPipeIndex)
    internal returns (uint256 amountOut) {
        pumpOut( amountIn, toPipeIndex);
        PipeSegment storage segment = pipes[toPipeIndex];

    }

    /// @dev re balance  pipe segments
    function rebalancePipe(uint256 pipeIndex) internal  {
        PipeSegment storage segment = pipes[pipeIndex];
        (uint256 imbalance, bool deficit) = segment.pipe.rebalance(segment.context);
        if (imbalance>0) {
            if (deficit) {
                pumpOut(imbalance, pipeIndex.add(1));
                // call rebalance again after we have closed deficit
                segment.pipe.rebalance(segment.context);
            } else {
                pumpIn(imbalance, pipeIndex.add(1));
            }
        }
    }

    /// @dev calls work for all pipe segments
    function rebalanceAllPipes() internal  {
        uint256 len = pipes.length;
        for (uint256 i=0; i<len; i++) {
            rebalancePipe(i);
        }
    }

    /// @dev Parses a revert reason that should contain the numeric quote
    function parseRevertReason(bytes memory reason) private pure returns (uint256) {
        if (reason.length != 32) {
            if (reason.length < 68) revert('Unexpected error');
            assembly {
                reason := add(reason, 0x04)
            }
            revert(abi.decode(reason, (string)));
        }
        return abi.decode(reason, (uint256));
    }


}
