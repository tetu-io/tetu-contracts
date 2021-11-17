// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../pipes/Pipe.sol";
import "./LinearPipeline.sol";


/// @title Linear Pipeline Calculator
/// @author bogdoslav
contract LinearPipelineCalculator {
    using SafeMath for uint256;

    LinearPipeline private pipeline;

    constructor(LinearPipeline _pipeline) {
        pipeline = _pipeline;
    }

    function getAmountOut(uint256 amountIn, uint256 toPipeIndex)
    public returns (uint256) {
        try pipeline.getAmountOutReverted(amountIn, toPipeIndex)
        {} catch (bytes memory reason) {
            return parseRevertReason(reason);
        }
        return 0;
    }

    function getTotalAmountOut()
    public returns (uint256) {
        uint256 amountIn = pipeline.getMostUnderlyingBalance();
        uint256 amountOut = getAmountOut(amountIn, 0);
        console.log('getTotalAmountOut amountOut', amountOut);
        return amountOut;
    }

    /// @dev Calculates how much we have to pump out to receive amountOut
    /// @param amountOut in source units of toPipeIndex
    /// @param toPipeIndex index of the pipe to pump out
    function getAmountInForAmountOut(uint256 amountOut, uint256 toPipeIndex)
    public returns (uint256 amountIn) {
        console.log('getAmountInForAmountOut amountOut, toPipeIndex', amountOut, toPipeIndex);
        if (amountOut == 0) return 0;

        uint256 totalIn  = pipeline.getMostUnderlyingBalance();
        console.log('   totalIn', totalIn);
        uint256 totalOut = getAmountOut(amountIn, toPipeIndex);
        console.log('   totalOut', totalOut);
        if (totalOut == 0) return 0;

        amountIn = totalIn.mul(amountOut).div(totalOut);
    }

    /// @dev Parses a revert reason that should contain the numeric answer
    function parseRevertReason(bytes memory reason)
    private pure returns (uint256) {
        if (reason.length != 32) {
            if (reason.length < 68) revert('LPC: Unexpected revert');
            assembly {
                reason := add(reason, 0x04)
            }
            revert(abi.decode(reason, (string)));
        }
        return abi.decode(reason, (uint256));
    }

}
