// SPDX-License-Identifier: ISC
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/

pragma solidity 0.8.4;

import "../../../../openzeppelin/SafeERC20.sol";
import "../../../../openzeppelin/Initializable.sol";
import "../../../interface/strategies/ILinearPipeline.sol";
import "../../../interface/strategies/IPipe.sol";
import "../../../SlotsLib.sol";
import "../pipes/PipeLib.sol";


/// @title Pipe Base Contract
/// @author bogdoslav
contract LinearPipeline is ILinearPipeline, Initializable {
  using SafeERC20 for IERC20;
  using SlotsLib for uint;

  uint internal constant _UNDERLYING_TOKEN_SLOT = uint(keccak256("eip1967.LinearPipeline.underlyingToken")) - 1;
  uint internal constant _PIPES                 = uint(keccak256("eip1967.LinearPipeline.pipes")) - 1;

  event RebalancedAllPipes();
  event PipeReplaced(uint pipeIndex, address fromPipe, address toPipe);

  function initializeLinearPipeline(address pipelineUnderlyingToken)
  public initializer {
    _UNDERLYING_TOKEN_SLOT.set(pipelineUnderlyingToken);
  }

  // ************* SLOT SETTERS/GETTERS *******************

  /// @dev Returns underlying token address
  function underlyingToken() external view override returns (address) {
    return _underlyingToken();
  }

  /// @dev Returns underlying token address from slot
  function _underlyingToken() internal view returns (address) {
    return _UNDERLYING_TOKEN_SLOT.getAddress();
  }

  // ***************************************
  // ************** VIEWS ******************
  // ***************************************

  /// @dev Returns pipes array length
  /// @return pipes array length
  function pipesLength() external view override returns (uint256) {
    return _pipesLength();
  }

  function _pipesLength() internal view returns (uint256) {
    return _PIPES.length();
  }

  function pipes(uint index) external override view returns (IPipe) {
    return _pipes(index);
  }

  function _pipes(uint index) internal view returns (IPipe) {
    return IPipe(_PIPES.addressAt(index));
  }

  /// @dev Checks if re-balance need some pipe(s)
  /// @return returns true when re-balance needed
  function isRebalanceNeeded() external view override returns (bool) {
    uint __pipesLength = _pipesLength();
    for (uint256 i = 0; i < __pipesLength; i++) {
      if (_pipes(i).needsRebalance()) {
        return true;
      }
    }
    return false;
  }

  /// @dev Returns balance of output (lp) token of the last pipe
  function getMostUnderlyingBalance() external view override returns (uint256) {
    return _getMostUnderlyingBalance();
  }

  /// @dev Returns balance of output (lp) token of the last pipe
  function _getMostUnderlyingBalance() internal view returns (uint256) {
    return _pipes(_pipesLength() - 1).outputBalance();
  }

  // ***************************************
  // ************** EXTERNAL ***************
  // ***************************************

  /// @dev Function to calculate amount we will receive when we withdraw amountIn from last pipe to pipe with toPipeIndex.
  ///      Return amountOut in revert message
  /// @param amountIn in most output tokens (lp tokens of the last pipe)
  /// @param toPipeIndex index of the pipe we should to pump out
  function getAmountOutReverted(uint256 amountIn, uint256 toPipeIndex) public override {
    uint256 amountOut = _pumpOut(amountIn, toPipeIndex);
    // store answer in revert message data
    assembly {
      let ptr := mload(0x40)
      mstore(ptr, amountOut)
      revert(ptr, 32)
    }
  }

  // ***************************************
  // ************** INTERNAL ***************
  // ***************************************

  /// @dev Returns amount out (when we withdraw amountIn most underlying tokens to pipe with specified index)
  /// @param amountIn in output units of last pipe
  /// @param toPipeIndex index of the last pipe to pump out
  function _getAmountOut(uint256 amountIn, uint256 toPipeIndex) internal returns (uint256) {
    try LinearPipeline(address(this)).getAmountOutReverted(amountIn, toPipeIndex)
    {} catch (bytes memory reason) {
      return parseRevertReason(reason);
    }
    return 0;
  }

  /// @dev Adds pipe to the end of pipeline and connects it
  /// @param newPipe to be added
  function _addPipe(IPipe newPipe) internal {
    require(newPipe.pipeline() == address(this), "LPL: Wrong owner");

    _PIPES.push(address(newPipe));
    uint __pipesLength = _pipesLength();

    if (__pipesLength > 1) {
      IPipe prevPipe = _pipes(__pipesLength - 2);
      require(prevPipe.outputToken() == newPipe.sourceToken(), 'LPL: Incompatible');
      prevPipe.setNextPipe(address(newPipe));
      newPipe.setPrevPipe(address(prevPipe));
    } else {// first pipe should have pipeline as prev pipe to send tokens on get()
      newPipe.setPrevPipe(address(this));
    }
  }

  /// @dev Replaces pipe in the pipeline
  /// @param pipeIndex index of pipe to change
  /// @param newPipe to be changed
  /// @param maxDecrease1000 maximum decrease ot totalAmountOut (in 0,1%)
  function _replacePipe(uint pipeIndex, IPipe newPipe, uint maxDecrease1000) internal {
    newPipe.setPipeline(address(this));

    uint totalAmountOutBefore = _getTotalAmountOut();

    IPipe currPipe = IPipe(_pipes(pipeIndex));
    require(
      currPipe.sourceToken() == newPipe.sourceToken() &&
      currPipe.outputToken() == newPipe.outputToken(),
      'LPL: Incompatible'
    );

    address prevPipe = currPipe.prevPipe();
    newPipe.setPrevPipe(prevPipe);
    if (prevPipe != address(0)) {
      if (pipeIndex > 0) {
        IPipe(prevPipe).setNextPipe(address(newPipe));
      }
    }

    address nextPipe = currPipe.nextPipe();
    newPipe.setNextPipe(nextPipe);
    if (nextPipe != address(0)) {
      IPipe(nextPipe).setPrevPipe(address(newPipe));
    }

    _PIPES.setAt(pipeIndex, address(newPipe));

    // pump in liquidity back from prev pipe or pipeline itself
    uint totalAmountOutAfter = _getTotalAmountOut();
    uint minTotalAmountOut = totalAmountOutBefore - (totalAmountOutBefore * maxDecrease1000 / 1000);
    // Let's do not replace pipe when we have unexpected loss
    require(totalAmountOutAfter > minTotalAmountOut, 'LP: Loss more than maxDecrease');

    emit PipeReplaced(pipeIndex, address(currPipe), address(newPipe));
  }

  /// @dev function for investing, deposits, entering, borrowing, from PipeIndex to the end
  /// @param sourceAmount in source units
  /// @return outputAmount in most underlying units
  function _pumpIn(uint256 sourceAmount, uint256 fromPipeIndex) internal returns (uint256 outputAmount)  {
    outputAmount = 0;
    uint __pipesLength = _pipesLength();

    for (uint256 i = fromPipeIndex; i < __pipesLength; i++) {
      outputAmount = _pipes(i).put(sourceAmount);
      sourceAmount = PipeLib.MAX_AMOUNT;
    }
  }

  /// @dev function for investing, deposits, entering, borrowing, from PipeIndex to the end
  /// @param sourceAmount in source units
  /// @return outputAmount in most underlying units
  function _pumpIn(uint256 sourceAmount) internal returns (uint256 outputAmount)  {
    address underlying = _underlyingToken();
    if (sourceAmount == PipeLib.MAX_AMOUNT) {
      sourceAmount = IERC20(underlying).balanceOf(address(this));
    }
    // send token to first pipe
    IERC20(underlying).safeTransfer(address(_pipes(0)), sourceAmount);
    outputAmount = _pumpIn(PipeLib.MAX_AMOUNT, 0);
  }

  /// @dev function for de-vesting, withdrawals, leaves, paybacks, from the end to PipeIndex
  /// @param underlyingAmount in most underlying units
  /// @param toPipeIndex pump out to previous pipe from pipe with this index (0 index pumps out to the pipeline)
  /// @return amountOut in source units
  function _pumpOut(uint256 underlyingAmount, uint256 toPipeIndex) internal returns (uint256 amountOut) {
    amountOut = 0;
    for (uint256 i = _pipesLength(); i > toPipeIndex; i--) {
      amountOut = _pipes(i - 1).get(underlyingAmount);
      underlyingAmount = PipeLib.MAX_AMOUNT;
    }
  }

  /// @dev function for de-vesting, withdrawals, leaves, paybacks, from the end to PipeIndex
  /// @param sourceAmount in source units
  /// @param toPipeIndex pump out to prev pipe of the pipe with this index
  /// @return amountOut in source units of pipe with toPipeIndex
  function _pumpOutSource(uint256 sourceAmount, uint256 toPipeIndex) internal returns (uint256 amountOut) {
//    if (sourceAmount == 0) {
//      return 0;
//    }
    uint256 underlyingAmount = getAmountInForAmountOut(sourceAmount, toPipeIndex);
    return _pumpOut(underlyingAmount, toPipeIndex);
  }

  /// @dev Re-balance pipe
  /// @param pipeIndex index of the pipe to rebalance
  function _rebalancePipe(uint256 pipeIndex) internal {
    IPipe pipe = _pipes(pipeIndex);
    if (!pipe.needsRebalance()) {
      return;
    }

    (uint256 imbalance, bool deficit) = pipe.rebalance();
    if (imbalance > 0) {
      if (deficit) {
        _pumpOutSource(imbalance, pipeIndex + 1);
        // call rebalance again after we have closed deficit
        pipe.rebalance();
      } else {
        _pumpIn(PipeLib.MAX_AMOUNT, pipeIndex + 1);
      }
    }
  }

  /// @dev Re-balance all pipes
  function _rebalanceAllPipes() internal {
    uint __pipesLength = _pipesLength();
    for (uint256 i = 0; i < __pipesLength; i++) {
      _rebalancePipe(i);
    }
    emit RebalancedAllPipes();
  }

  /// @dev Calls claim() for all pipes
  function _claimFromAllPipes() internal {
    uint __pipesLength = _pipesLength();
    for (uint256 i = 0; i < __pipesLength; i++) {
      IPipe(_PIPES.addressAt(i)).claim();
    }
  }

  /// @notice Pipeline can claim coins that are somehow transferred into the pipes
  /// @param recipient Recipient address
  /// @param recipient Token address
  function _salvageFromAllPipes(address recipient, address token) internal {
    uint __pipesLength = _pipesLength();
    for (uint256 i = 0; i < __pipesLength; i++) {
      _pipes(i).salvageFromPipe(recipient, token);
    }
  }

  /// @dev Returns total amount out (when we withdraw all most underlying tokens)
  function _getTotalAmountOut() internal returns (uint256) {
    return _getAmountOut(_getMostUnderlyingBalance(), 0);
  }

  /// @dev Calculates how much we have to pump out to receive amountOut
  /// @param amountOut in source units of toPipeIndex
  /// @param toPipeIndex index of the pipe to pump out
  function getAmountInForAmountOut(uint256 amountOut, uint256 toPipeIndex) internal returns (uint256 amountIn) {
    if (amountOut == 0) {
      return 0;
    }
    uint256 totalIn = _getMostUnderlyingBalance();
    uint256 totalOut = _getAmountOut(totalIn, toPipeIndex);
    if (totalOut == 0) {
      return 0;
    }
    amountIn = totalIn * amountOut / totalOut;
  }

  /// @dev Parses a revert reason that should contain the numeric answer
  /// @param reason encoded revert reason
  /// @return numeric answer
  function parseRevertReason(bytes memory reason) private pure returns (uint256) {
    if (reason.length != 32) {
      if (reason.length < 68) {
        revert('LPL: Unexpected');
      }
      assembly {
        reason := add(reason, 0x04)
      }
      revert(abi.decode(reason, (string)));
    }
    return abi.decode(reason, (uint256));
  }

  // !!! decrease gap size after adding variables!!!
  //slither-disable-next-line unused-state
  uint[32] private ______gap;
}
