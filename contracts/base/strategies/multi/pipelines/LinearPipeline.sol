// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../pipes/Pipe.sol";
import "../pipes/PipeSegment.sol";
import "../pipes/PipeDelegateCall.sol";


/// @title Pipe Base Contract
/// @author bogdoslav
contract LinearPipeline {
    using SafeMath for uint256;
    using PipeDelegateCall for PipeSegment;

    PipeSegment[] public segments;

    /// @dev function for investing, deposits, entering, borrowing, from PipeIndex to the end
    /// @param amount in source units
    /// @returns amount in underlying units
    function pumpIn(uint256 amount, uint256 fromPipeIndex)
    internal returns (uint256 amountIn)  {
        amountIn = amount;
        uint256 len = segments.length;
        for (uint256 i=fromPipeIndex; i<len; i++) {
            amountIn = segments[i].put(amountIn);
        }
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks, from the end to PipeIndex
    /// @param amount in underlying units
    /// @returns amount in source units
    function pumpOut(uint256 underlyingAmount, uint256 toPipeIndex)
    internal returns (uint256 amountOut) {
        amountOut = underlyingAmount;
        uint256 len = segments.length;
        for (uint256 i=len-1; i>=toPipeIndex; i--) {
            amountOut = segments[i].get(amountOut);
        }
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks, from the end to PipeIndex
    /// @param amount in source units
    /// @returns amount in source units
    function pumpOutSource(uint256 sourceAmount, uint256 toPipeIndex)
    internal returns (uint256 amountOut) {
        uint256 underlyingAmount = getAmountInForAmountOut(sourceAmount, toPipeIndex);
        return pumpOut(underlyingAmount, toPipeIndex);
    }

    function getAmountOut_Reverted(uint256 amountIn, uint256 toPipeIndex)
    private {
        pumpOut(amountIn, toPipeIndex);
        PipeSegment storage segment = segments[toPipeIndex];
        uint256 amountOut = segment.sourceBalance();
        // store answer in revert message data
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, amountOut)
            revert(ptr, 32)
        }
    }

    function getAmountOut(uint256 amountIn, uint256 toPipeIndex)
    internal returns (uint256) {
        try getAmountOut_Reverted(amountIn, toPipeIndex)
        {} catch (bytes memory reason) {
            return parseRevertReason(reason);
        }
        return 0;
    }

    function getTotalAmountOut(uint256 toPipeIndex)
    internal returns (uint256) {
        uint256 last = segments.length-1;
        uint256 amountIn = segments[last].underlyingBalance();
        return getAmountOut(amountIn, toPipeIndex);
    }

    function getAmountInForAmountOut(uint256 amountOut, uint256 toPipeIndex)
    internal returns (uint256 amountIn) {
        uint256 last = segments.length-1;
        uint256 totalIn  = segments[last].underlyingBalance();
        uint256 totalOut = getAmountOut(amountIn, toPipeIndex);

        amountIn = totalIn.mul(amountOut).div(totalOut);
    }

    /// @dev re balance pipe segments
    function rebalancePipe(uint256 pipeIndex) internal {
        PipeSegment storage segment = segments[pipeIndex];
        (uint256 imbalance, bool deficit) = segment.rebalance();
        if (imbalance>0) {
            if (deficit) {
                pumpOutSource(imbalance, pipeIndex.add(1));
                // call rebalance again after we have closed deficit
                segment.rebalance();
            } else {
                pumpIn(imbalance, pipeIndex.add(1));
            }
        }
    }

    /// @dev calls work for all pipe segments
    function rebalanceAllPipes() internal  {
        uint256 len = segments.length;
        for (uint256 i=0; i<len; i++) {
            rebalancePipe(i);
        }
    }

    /// @dev Parses a revert reason that should contain the numeric answer
    function parseRevertReason(bytes memory reason)
    private pure returns (uint256) {
        if (reason.length != 32) {
            if (reason.length < 68) revert('Unexpected revert');
            assembly {
                reason := add(reason, 0x04)
            }
            revert(abi.decode(reason, (string)));
        }
        return abi.decode(reason, (uint256));
    }


}
