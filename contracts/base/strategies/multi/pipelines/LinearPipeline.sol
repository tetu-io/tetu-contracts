// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../pipes/Pipe.sol";
import "../pipes/StartingPipe.sol";
import "./LinearPipelineCalculator.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";


/// @title Pipe Base Contract
/// @author bogdoslav
contract LinearPipeline is StartingPipe {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    LinearPipelineCalculator public calculator;
    Pipe[] public pipes;

    constructor(address underlyingToken) StartingPipe(underlyingToken) {
        console.log('LinearPipelineCalculator constructor address(this)', address(this));
        setPipeline(address(this)); // to call StartingPipe onlyPipeline methods
        calculator = new LinearPipelineCalculator(this);
        addPipe(this); // add self as first pipe in line
    }

    /// @dev Adds pipe to the end of pipeline and connects it
    /// @param newPipe to be added
    function addPipe(Pipe newPipe) internal {
        console.log('addPipe newPipe', address(newPipe));
        pipes.push(newPipe);
        console.log('pipes.length', pipes.length);

        if (pipes.length > 1) {
            if (pipes.length == 2) { // adding to this StartingPipe
                setNextPipe(newPipe);
            } else {
                Pipe prevPipe = pipes[pipes.length-2];
                console.log('prevPipe', address(prevPipe));
                prevPipe.setNextPipe(newPipe);
            }
            newPipe.setPrevPipe(prevPipe);
        }
    }

    /// @dev function for investing, deposits, entering, borrowing, from PipeIndex to the end
    /// @param sourceAmount in source units
    /// @return amountIn in most underlying units
    function pumpIn(uint256 sourceAmount, uint256 fromPipeIndex)
    internal returns (uint256 amountIn)  {
        console.log('pumpIn sourceAmount, fromPipeIndex', sourceAmount, fromPipeIndex);
        amountIn = sourceAmount;
        uint256 len = pipes.length;
        for (uint256 i=fromPipeIndex; i<len; i++) {
            console.log('put i, amountIn', i, amountIn);
            amountIn = pipes[i].put(amountIn);
        }
        console.log('last amount', amountIn);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks, from the end to PipeIndex
    /// @param underlyingAmount in most underlying units
    /// @param toPipeIndex pump out to pipe with this index
    /// @return amountOut in source units
    function pumpOut(uint256 underlyingAmount, uint256 toPipeIndex)
    internal returns (uint256 amountOut) {
        console.log('pumpOut underlyingAmount, toPipeIndex', underlyingAmount, toPipeIndex);
        amountOut = underlyingAmount;
        uint256 len = pipes.length;
        for (uint256 i=len-1; i>=toPipeIndex; i--) {
            console.log('put i, amountOut', i, amountOut);
            amountOut = pipes[i].get(amountOut);
        }
        console.log('last amount', amountOut);

    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks, from the end to PipeIndex
    /// @param sourceAmount in source units
    /// @param toPipeIndex pump out to pipe with this index
    /// @return amountOut in source units
    function pumpOutSource(uint256 sourceAmount, uint256 toPipeIndex)
    internal returns (uint256 amountOut) {
        console.log('pumpOutSource sourceAmount, toPipeIndex', sourceAmount, toPipeIndex);
        uint256 underlyingAmount = calculator.getAmountInForAmountOut(sourceAmount, toPipeIndex);
        return pumpOut(underlyingAmount, toPipeIndex);
    }

    /// @dev re balance pipe pipes
    function rebalancePipe(uint256 pipeIndex) internal {
        console.log('rebalancePipe pipeIndex', pipeIndex);
        Pipe pipe = pipes[pipeIndex];
        (uint256 imbalance, bool deficit) = pipe.rebalance();
        console.log('imbalance, deficit', imbalance, deficit);
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

    /// @dev calls work for all pipes
    function rebalanceAllPipes() internal  {
        uint256 len = pipes.length;
        for (uint256 i=0; i<len; i++) {
            rebalancePipe(i);
        }
    }

    /// @dev calls claim() for all pipes
    function claimFromAllPipes() internal  {
        uint256 len = pipes.length;
        for (uint256 i=0; i<len; i++) {
            pipes[i].claim();
        }
    }

    function getAmountOutReverted(uint256 amountIn, uint256 toPipeIndex)
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
        return pipes[last].outputBalance();
    }

    /// @notice Pipeline can claim coins that are somehow transferred into the pipes
    /// @param recipient Recipient address
    /// @param recipient Token address
    function salvageFromAllPipes(address recipient, address token)
    internal {
        uint256 len = pipes.length;
        for (uint256 i=0; i<len; i++) {
            pipes[i].salvage(recipient, token);
        }
    }

}
