// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


/// @title Pipe Base Contract
/// @author bogdoslav
abstract contract Pipe is Ownable {

    Pipe public prevPipe;
    Pipe public nextPipe;

    constructor () {
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param _nextPipe - next pipe in pipeline
    function setNext(Pipe _nextPipe) onlyOwner public {
        nextPipe = _nextPipe;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param _prevPipe - next pipe in pipeline
    function setPrev(Pipe _prevPipe) onlyOwner public {
        prevPipe = _prevPipe;
    }

    function haveNextPipe() internal view returns (bool) {
        return address(nextPipe) != address(0);
    }

    function havePrevPipe() internal view returns (bool) {
        return address(prevPipe) != address(0);
    }

    //TODO Do we need salvage function? To pump out balances and tokens from pipe contracts to main?

    /// @dev function for investing, deposits, entering, borrowing. Do not forget to transfer assets to next pipe
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) virtual public
    returns (uint256 output);

    /// @dev function for de-vesting, withdrawals, leaves, paybacks. Amount in underlying units. Do not forget to transfer assets to prev pipe
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) virtual public
    returns (uint256 output);

    /// @dev function for re balancing. When rebalance
    /// @return imbalance in underlying units
    /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function rebalance() onlyOwner virtual public
    returns (uint256 imbalance, bool deficit){
        // balanced, no deficit by default
        return (0,false);
    }

    /// @dev available source balance (tokens, matic etc). Must be implemented for first pipe in line.
    /// @return balance in source units
    function sourceBalance() virtual public view
    returns (uint256) {
        revert("PIPE: not implemented");
    }

    /// @dev underlying balance (LP tokens, collateral etc). Must be implemented for last pipe in line and all pipes after balancing pipes.
    /// @return balance in underlying units
    function underlyingBalance() virtual public view
    returns (uint256) {
        revert("PIPE: not implemented");
    }

    /// Helper functions


    /// @dev Transfers ERC20 token to next pipe when its exists
    /// @param ERC20Token ERC20 token address
    /// @param amount to transfer
    function transferERC20toNextPipe(address ERC20Token, uint256 amount) internal {
        if (haveNextPipe()) {
            IERC20(ERC20Token).transfer(address(nextPipe), amount);
        }
    }

    /// @dev Transfers ERC20 token to previous pipe when its exists
    /// @param ERC20Token ERC20 token address
    /// @param amount to transfer
    function transferERC20toPrevPipe(address ERC20Token, uint256 amount) internal {
        if (havePrevPipe()) {
            IERC20(ERC20Token).transfer(address(prevPipe), amount);
        }
    }

    /// @dev returns ERC20 token balance
    /// @param ERC20Token ERC20 token address
    /// @return balance for address(this)
    function ERC20Balance(address ERC20Token)
    internal view returns (uint256){
        return IERC20(ERC20Token).balanceOf(address(this));
    }
}
