// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "hardhat/console.sol";

/// @title Pipe Base Contract
/// @author bogdoslav
abstract contract Pipe {
    using SafeERC20 for IERC20;

    /// @notice Address of the master pipeline
    address private _pipeline;

    /// @notice Address representing ether (bnb, matic) for statistical purposes only
    address internal constant _ETHER =  0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Source token address type for statistical purposes only
    /// @dev initialize it in constructor, for ether (bnb, matic) use _ETHER
    address sourceToken;
    /// @notice Output token address type for statistical purposes only
    /// @dev initialize it in constructor, for ether (bnb, matic) use _ETHER
    address outputToken;

    /// @notice Next pipe in pipeline
    Pipe public prevPipe;
    /// @notice Previous pipe in pipeline
    Pipe public nextPipe;

    constructor () {
        _pipeline = msg.sender;
    }

    function setPipeline(address pipeline) public onlyPipeline {
        console.log('setPipeline', pipeline);
        _pipeline = pipeline;
    }

    modifier onlyPipeline() {
        console.log('onlyPipeline _pipeline, msg.sender', _pipeline, msg.sender); //TODO rm
        require(
//            _pipeline == address(0) || _pipeline == msg.sender || msg.sender == address(this),
            _pipeline == msg.sender || msg.sender == address(this),
            "PIPE: caller is not the pipeline"
        );
        _;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param _nextPipe - next pipe in pipeline
    function setNextPipe(Pipe _nextPipe) onlyPipeline public {
        nextPipe = _nextPipe;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param _prevPipe - next pipe in pipeline
    function setPrevPipe(Pipe _prevPipe) onlyPipeline public {
        prevPipe = _prevPipe;
    }

    /// @dev Checks is pipe have next pipe connected
    /// @return true when connected
    function haveNextPipe() internal view returns (bool) {
        return address(nextPipe) != address(0);
    }

    /// @dev Checks is pipe have previous pipe connected
    /// @return true when connected
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
    function rebalance() onlyPipeline virtual public
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
    function outputBalance() virtual public view
    returns (uint256) {
        revert("PIPE: not implemented");
    }

    /// @notice Pipeline can claim coins that are somehow transferred into the contract
    ///         Note that they cannot come in take away coins that are used and defined in the strategy itself
    /// @param recipient Recipient address
    /// @param recipient Token address
    function salvage(address recipient, address token)
    public virtual onlyPipeline {
        // To make sure that governance cannot come in and take away the coins
        if (sourceToken == token || outputToken == token) return;

        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(recipient, amount);
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
