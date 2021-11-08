// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../pipes/Pipe.sol";
import "./LinearPipelineCalculator.sol";

import "hardhat/console.sol";


/// @title Pipe Base Contract
/// @author bogdoslav
contract LinearPipeline {
    using SafeMath for uint256;

    LinearPipelineCalculator public calculator;
    Pipe[] public pipes;

    constructor() {
        calculator = new LinearPipelineCalculator(this);
    }

    /// @dev Adds pipe to the end of pipeline and connects it
    /// @param newPipe to be added
    function addPipe(Pipe newPipe) internal {
        Pipe prevPipe = pipes[pipes.length-1];
        pipes.push(newPipe);

        prevPipe.setNext(newPipe);
        newPipe.setPrev(prevPipe);
    }

    /// @dev function for investing, deposits, entering, borrowing, from PipeIndex to the end
    /// @param sourceAmount in source units
    /// @return amountIn in most underlying units
    function pumpIn(uint256 sourceAmount, uint256 fromPipeIndex)
    internal returns (uint256 amountIn)  {
        amountIn = sourceAmount;
        uint256 len = pipes.length;
        for (uint256 i=fromPipeIndex; i<len; i++) {
            console.log('put i, amountIn', i, amountIn);
            amountIn = pipes[i].put(amountIn);
        }
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks, from the end to PipeIndex
    /// @param underlyingAmount in most underlying units
    /// @param toPipeIndex pump out to pipe with this index
    /// @return amountOut in source units
    function pumpOut(uint256 underlyingAmount, uint256 toPipeIndex)
    internal returns (uint256 amountOut) {
        amountOut = underlyingAmount;
        uint256 len = pipes.length;
        for (uint256 i=len-1; i>=toPipeIndex; i--) {
            amountOut = pipes[i].get(amountOut);
        }
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks, from the end to PipeIndex
    /// @param sourceAmount in source units
    /// @param toPipeIndex pump out to pipe with this index
    /// @return amountOut in source units
    function pumpOutSource(uint256 sourceAmount, uint256 toPipeIndex)
    internal returns (uint256 amountOut) {
        uint256 underlyingAmount = calculator.getAmountInForAmountOut(sourceAmount, toPipeIndex);
        return pumpOut(underlyingAmount, toPipeIndex);
    }

    /// @dev re balance pipe pipes
    function rebalancePipe(uint256 pipeIndex) internal {
        Pipe pipe = pipes[pipeIndex];
        (uint256 imbalance, bool deficit) = pipe.rebalance();
        if (imbalance>0) {
            if (deficit) {
                pumpOutSource(imbalance, pipeIndex.add(1));
                // call rebalance again after we have closed deficit
                pipe.rebalance();
            } else {
                pumpIn(imbalance, pipeIndex.add(1));
            }
        }
    }

    /// @dev calls work for all pipe pipes
    function rebalanceAllPipes() internal  {
        uint256 len = pipes.length;
        for (uint256 i=0; i<len; i++) {
            rebalancePipe(i);
        }
    }

    function getAmountOut_Reverted(uint256 amountIn, uint256 toPipeIndex)
    public {
        pumpOut(amountIn, toPipeIndex);
        Pipe pipe = pipes[toPipeIndex];
        uint256 amountOut = pipe.sourceBalance();
        // store answer in revert message data
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, amountOut)
            revert(ptr, 32)
        }
    }

    function getMostUnderlyingBalance() public view returns (uint256) {
        uint256 last = pipes.length-1;
        return pipes[last].underlyingBalance();
    }

}
