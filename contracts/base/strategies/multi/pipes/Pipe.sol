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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../../interface/IPipe.sol";

/// @title Pipe Base Contract
/// @author bogdoslav
abstract contract Pipe is IPipe {
  using SafeERC20 for IERC20;

  /// @dev After adding the pipe to a pipeline it should be immediately initialized
  bool public override init = false;

  /// @notice Address of the master pipeline
  address public override pipeline;

  /// @notice Pipe name for statistical purposes only
  /// @dev initialize it in constructor
  string public override name;
  /// @notice Source token address type for statistical purposes only
  /// @dev initialize it in constructor, for ether (bnb, matic) use _ETHER
  address public immutable override sourceToken;
  /// @notice Output token address type for statistical purposes only
  /// @dev initialize it in constructor, for ether (bnb, matic) use _ETHER
  address public immutable override outputToken;

  /// @notice Reward token address for claiming
  /// @dev initialize it in constructor
  address[] public override rewardTokens;

  /// @notice Next pipe in pipeline
  address public override prevPipe;
  /// @notice Previous pipe in pipeline
  address public override nextPipe;

  constructor (
    string memory _name,
    address _sourceToken,
    address _outputToken
  ) {
    require(_sourceToken != address(0), "Zero source token");
    require(_outputToken != address(0), "Zero output token");

    name = _name;
    sourceToken = _sourceToken;
    outputToken = _outputToken;
  }

  modifier onlyPipeline() {
    require(
      pipeline == msg.sender || pipeline == address(this),
      "PIPE: caller is not the pipeline"
    );
    _;
  }

  /// @dev After adding the pipe to a pipeline it should be immediately initialized
  function setPipeline(address _pipeline) external override {
    require(!init, "PIPE: Already init");
    pipeline = _pipeline;
    init = true;
  }

  /// @dev Size of reward tokens array
  function rewardTokensLength() external view override returns (uint) {
    return rewardTokens.length;
  }

  /// @dev function for investing, deposits, entering, borrowing
  /// @param _nextPipe - next pipe in pipeline
  function setNextPipe(address _nextPipe) onlyPipeline override external {
    nextPipe = _nextPipe;
  }

  /// @dev function for investing, deposits, entering, borrowing
  /// @param _prevPipe - next pipe in pipeline
  function setPrevPipe(address _prevPipe) onlyPipeline override external {
    prevPipe = _prevPipe;
  }

  /// @dev function for investing, deposits, entering, borrowing. Do not forget to transfer assets to next pipe
  /// @param amount in source units
  /// @return output in underlying units
  function put(uint256 amount) virtual override external returns (uint256 output);

  /// @dev function for de-vesting, withdrawals, leaves, paybacks. Amount in underlying units. Do not forget to transfer assets to prev pipe
  /// @param amount in underlying units
  /// @return output in source units
  function get(uint256 amount) virtual override external returns (uint256 output);

  /// @dev function for re balancing. Mark it as onlyPipeline when override
  /// @return imbalance in underlying units
  /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
  function rebalance() virtual override external returns (uint256 imbalance, bool deficit) {
    // balanced, no deficit by default
    return (0, false);
  }

  /// @dev Returns true when rebalance needed
  function needsRebalance() virtual override external view returns (bool){
    // balanced, no deficit by default
    return false;
  }

  /// @dev function for claiming rewards
  function claim() onlyPipeline virtual override external {
    for (uint i = 0; i < rewardTokens.length; i++) {
      address rewardToken = rewardTokens[i];
      if (rewardToken == address(0)) {
        return;
      }
      require(pipeline != address(0));

      uint256 amount = _erc20Balance(rewardToken);
      if (amount > 0) {
        IERC20(rewardToken).safeTransfer(pipeline, amount);
      }
    }
  }

  /// @dev available source balance (tokens, matic etc). Must be implemented for first pipe in line.
  /// @return balance in source units
  function sourceBalance() external view virtual override returns (uint256) {
    return _erc20Balance(sourceToken);
  }

  /// @dev underlying balance (LP tokens, collateral etc). Must be implemented for last pipe in line and all pipes after balancing pipes.
  /// @return balance in underlying units
  function outputBalance() virtual override external view returns (uint256) {
    return _erc20Balance(outputToken);
  }

  /// @notice Pipeline can claim coins that are somehow transferred into the contract
  /// @param recipient Recipient address
  /// @param recipient Token address
  function salvageFromPipe(address recipient, address token) external virtual override onlyPipeline {
    // To make sure that governance cannot come in and take away the coins
    // checking first and last pipes only to have ability salvage tokens from inside pipeline
    if ((!hasPrevPipe() || !hasNextPipe())
      && (sourceToken == token || outputToken == token)) {
      return;
    }

    uint256 amount = _erc20Balance(token);
    if (amount > 0) {
      IERC20(token).safeTransfer(recipient, amount);
    }
  }

  // ***************************************
  // ************** INTERNAL HELPERS *******
  // ***************************************

  /// @dev Checks is pipe have next pipe connected
  /// @return true when connected
  function hasNextPipe() internal view returns (bool) {
    return nextPipe != address(0);
  }

  /// @dev Checks is pipe have previous pipe connected
  /// @return true when connected
  function hasPrevPipe() internal view returns (bool) {
    return prevPipe != address(0);
  }

  /// @dev Transfers ERC20 token to next pipe when its exists
  /// @param _token ERC20 token address
  /// @param amount to transfer
  function _transferERC20toNextPipe(address _token, uint256 amount) internal {
    if (hasNextPipe()) {
      IERC20(_token).safeTransfer(nextPipe, amount);
    }
  }

  /// @dev Transfers ERC20 token to previous pipe when its exists
  /// @param _token ERC20 token address
  /// @param amount to transfer
  function _transferERC20toPrevPipe(address _token, uint256 amount) internal {
    if (hasPrevPipe()) {
      IERC20(_token).safeTransfer(prevPipe, amount);
    }
  }

  /// @dev returns ERC20 token balance
  /// @param _token ERC20 token address
  /// @return balance for address(this)
  function _erc20Balance(address _token) internal view returns (uint256){
    return IERC20(_token).balanceOf(address(this));
  }

  /// @dev Approve to spend ERC20 token amount for spender
  /// @param _token ERC20 token address
  /// @param spender address
  /// @param amount to spend
  function _erc20Approve(address _token, address spender, uint256 amount) internal {
    IERC20(_token).safeApprove(spender, 0);
    IERC20(_token).safeApprove(spender, amount);
  }

}
