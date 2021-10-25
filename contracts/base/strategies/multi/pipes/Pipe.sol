// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

/// @title Pipe Base Contract
/// @author bogdoslav
abstract contract Pipe {

    //  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    /// !!! WARNING! Ancestors must no have any storage variables !!!
    //  !!! It should receive all data trough abi-encoded context !!!
    //  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

    string private constant _NOT_IMPLEMENTED = "PIPE: not implemented";

    /// See ./WrappingPipe.sol and ./AaveWethPipe.sol for creating/decoding context example
    /// dev create context from desired parameters
    //function create(...) public pure returns (bytes memory)

    /// dev decode context to variables
    //function context(bytes memory c) private pure returns (...)

    /// !!! All _ underscored functions should not be called directly, but delegatecall only

    /// @dev function for investing, deposits, entering, borrowing
    /// @param c abi-encoded context
    /// @param amount in source units
    /// @return output in underlying units
    function _put(bytes memory c, uint256 amount) virtual public returns (uint256 output);

    /// @dev function for de-vesting, withdrawals, leaves, paybacks. Amount in underlying units
    /// @param c abi-encoded context
    /// @param amount in underlying units
    /// @return output in source units
    function _get(bytes memory c, uint256 amount) virtual public returns (uint256 output);

    /// @dev function for re balancing. When rebalance
    /// @param c abi-encoded context
    /// @return imbalance in underlying units
    /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function _rebalance(bytes memory c) virtual public returns (uint256 imbalance, bool deficit){
        // balanced, no deficit by default
        return (0,false);
    }

    /// @dev available source balance (tokens, matic etc)
    /// param c abi-encoded context
    /// @return balance in source units
    function _sourceBalance(bytes memory) virtual public returns (uint256) {
        revert(_NOT_IMPLEMENTED);
    }

    /// @dev underlying balance (LP tokens, collateral etc)
    /// param c abi-encoded context
    /// @return balance in underlying units
    function _underlyingBalance(bytes memory) virtual public returns (uint256) {
        revert(_NOT_IMPLEMENTED);
    }

}