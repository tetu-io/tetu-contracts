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
    address internal constant _ETHER = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    /// @notice Pipe name for statistical purposes only
    /// @dev initialize it in constructor
    string public name;
    /// @notice Source token address type for statistical purposes only
    /// @dev initialize it in constructor, for ether (bnb, matic) use _ETHER
    address public sourceToken;
    /// @notice Output token address type for statistical purposes only
    /// @dev initialize it in constructor, for ether (bnb, matic) use _ETHER
    address public outputToken;

    /// @notice Reward token address for claiming
    /// @dev initialize it in constructor
    address public rewardToken;

    /// @notice Next pipe in pipeline
    address public prevPipe;
    /// @notice Previous pipe in pipeline
    address public nextPipe;

    constructor () {
        _pipeline = msg.sender;
    }

    function setPipeline(address pipeline) public onlyPipeline {
        console.log('setPipeline', name, pipeline);
        _pipeline = pipeline;
    }

    modifier onlyPipeline() {
        require(
            _pipeline == msg.sender || _pipeline == address(this),
            "PIPE: caller is not the pipeline"
        );
        _;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param _nextPipe - next pipe in pipeline
    function setNextPipe(address _nextPipe) onlyPipeline public {
        nextPipe = _nextPipe;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param _prevPipe - next pipe in pipeline
    function setPrevPipe(address _prevPipe) onlyPipeline public {
        prevPipe = _prevPipe;
    }

    /// @dev Checks is pipe have next pipe connected
    /// @return true when connected
    function haveNextPipe() internal view returns (bool) {
        return nextPipe != address(0);
    }

    /// @dev Checks is pipe have previous pipe connected
    /// @return true when connected
    function havePrevPipe() internal view returns (bool) {
        return prevPipe != address(0);
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

    /// @dev function for re balancing
    /// @return imbalance in underlying units
    /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function rebalance() onlyPipeline virtual public
    returns (uint256 imbalance, bool deficit){
        // balanced, no deficit by default
        return (0, false);
    }

    /// @dev Returns true when rebalance needed
    function needsRebalance() virtual public view
    returns (bool){
        // balanced, no deficit by default
        return false;
    }

    /// @dev function for claiming rewards
    function claim() onlyPipeline virtual public {
        if (rewardToken == address(0)) return;
        require(_pipeline != address(0));

        uint256 amount = IERC20(rewardToken).balanceOf(address(this));
        console.log('claim amount', amount, name);
        if (amount > 0) {
            IERC20(rewardToken).safeTransfer(_pipeline, amount);
        }
    }

    /// @dev available source balance (tokens, matic etc). Must be implemented for first pipe in line.
    /// @return balance in source units
    function sourceBalance() virtual public view
    returns (uint256) {
        return ERC20Balance(sourceToken);
    }

    /// @dev underlying balance (LP tokens, collateral etc). Must be implemented for last pipe in line and all pipes after balancing pipes.
    /// @return balance in underlying units
    function outputBalance() virtual public view
    returns (uint256) {
        return ERC20Balance(outputToken);
    }

    /// @notice Pipeline can claim coins that are somehow transferred into the contract
    /// @param recipient Recipient address
    /// @param recipient Token address
    function salvageFromPipe(address recipient, address token)
    public virtual onlyPipeline {
        // To make sure that governance cannot come in and take away the coins
        // checking first and last pipes only to have ability salvage tokens from inside pipeline
        if ((!havePrevPipe() || !haveNextPipe())
            && (sourceToken == token || outputToken == token)) return;

        uint256 amount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(recipient, amount);
    }

    /// Helper functions

    /// @dev Transfers ERC20 token to next pipe when its exists
    /// @param ERC20Token ERC20 token address
    /// @param amount to transfer
    function transferERC20toNextPipe(address ERC20Token, uint256 amount) internal {
        if (haveNextPipe()) {
            IERC20(ERC20Token).safeTransfer(nextPipe, amount);
        }
    }

    /// @dev Transfers ERC20 token to previous pipe when its exists
    /// @param ERC20Token ERC20 token address
    /// @param amount to transfer
    function transferERC20toPrevPipe(address ERC20Token, uint256 amount) internal {
        if (havePrevPipe()) {
            IERC20(ERC20Token).safeTransfer(prevPipe, amount);
        }
    }

    /// @dev returns ERC20 token balance
    /// @param ERC20Token ERC20 token address
    /// @return balance for address(this)
    function ERC20Balance(address ERC20Token)
    internal view returns (uint256){
        return IERC20(ERC20Token).balanceOf(address(this));
    }

    /// @dev Approve to spend ERC20 token amount for spender
    /// @param ERC20Token ERC20 token address
    /// @param spender address
    /// @param amount to spend
    function ERC20Approve(address ERC20Token, address spender, uint256 amount) internal {
        IERC20(ERC20Token).safeApprove(spender, 0);
        IERC20(ERC20Token).safeApprove(spender, amount);
    }

    function toDecimals(uint256 input, uint256 fromDecimals, uint256 outputDecimals)
    internal pure returns (uint256) {
        return input * (10 ** fromDecimals) / (10 ** outputDecimals);
    }

}
