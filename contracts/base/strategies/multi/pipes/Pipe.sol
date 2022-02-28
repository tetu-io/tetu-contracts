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

import "./../../../../openzeppelin/IERC20.sol";
import "./../../../../openzeppelin/SafeERC20.sol";
import "./../../../../openzeppelin/Initializable.sol";
import "../../../interface/strategies/IPipe.sol";
import "../../../SlotsLib.sol";
import "./PipeLib.sol";

/// @title Pipe Base Contract
/// @author bogdoslav
abstract contract Pipe is IPipe, Initializable {
  using SafeERC20 for IERC20;
  using SlotsLib for bytes32;

  /// @notice Address of the master pipeline
  /// @dev After adding the pipe to a pipeline it should be immediately initialized
  bytes32 internal constant _PIPELINE_SLOT = bytes32(uint256(keccak256("eip1967.Pipe.pipeline")) - 1);

  /// @notice Pipe name for statistical purposes only
  /// @dev initialize it in constructor
  bytes32 internal constant _NAME_SLOT = bytes32(uint256(keccak256("eip1967.Pipe.name")) - 1);

  /// @notice Source token address type
  /// @dev initialize it in constructor, for ether (bnb, matic) use _ETHER
  bytes32 internal constant _SOURCE_TOKEN_SLOT = bytes32(uint256(keccak256("eip1967.Pipe.sourceToken")) - 1);

  /// @notice Output token address type
  /// @dev initialize it in constructor, for ether (bnb, matic) use _ETHER
  bytes32 internal constant _OUTPUT_TOKEN_SLOT = bytes32(uint256(keccak256("eip1967.Pipe.outputToken")) - 1);

  /// @notice Next pipe in pipeline
  bytes32 internal constant _PREV_PIPE_SLOT = bytes32(uint256(keccak256("eip1967.Pipe.prevPipe")) - 1);

  /// @notice Previous pipe in pipeline
  bytes32 internal constant _NEXT_PIPE_SLOT = bytes32(uint256(keccak256("eip1967.Pipe.nextPipe")) - 1);

  /// @notice Reward token address for claiming
  /// @dev initialize it in constructor
  address[] public override rewardTokens;

  event Get(uint256 amount, uint256 output);
  event Put(uint256 amount, uint256 output);

  function _initialize(
    string memory __name,
    address __sourceToken,
    address __outputToken
  ) internal initializer {
    require(__sourceToken != address(0), "Zero source token");
    require(__outputToken != address(0), "Zero output token");

    _NAME_SLOT.set(__name);
    _SOURCE_TOKEN_SLOT.set(__sourceToken);
    _OUTPUT_TOKEN_SLOT.set(__outputToken);
  }

  modifier onlyPipeline() {
    address _pipeline = _PIPELINE_SLOT.getAddress();
    require(
      _pipeline == msg.sender || _pipeline == address(this),
      "PIPE: caller is not the pipeline"
    );
    _;
  }

  // ************* SLOT SETTERS/GETTERS *******************
  function sourceToken() external view override returns (address) {
    return _sourceToken();
  }

  function _sourceToken() internal view returns (address) {
    return _SOURCE_TOKEN_SLOT.getAddress();
  }

  function outputToken() external view override returns (address) {
    return _outputToken();
  }

  function _outputToken() internal view returns (address) {
    return _OUTPUT_TOKEN_SLOT.getAddress();
  }

  function name() external view override returns (string memory) {
    return _NAME_SLOT.getString();
  }

  function pipeline() external view override returns (address) {
    return _PIPELINE_SLOT.getAddress();
  }

  function nextPipe() external view override returns (address) {
    return _NEXT_PIPE_SLOT.getAddress();
  }

  function prevPipe() external view override returns (address) {
    return _PREV_PIPE_SLOT.getAddress();
  }

  // ******************************************************

  /// @dev Replaces MAX constant to source token balance. Should be used at put() function start
  function maxSourceAmount(uint256 amount) internal view returns (uint256) {
    if (amount == PipeLib.MAX_AMOUNT) {
      return sourceBalance();
    } else {
      return amount;
    }
  }

  /// @dev Replaces MAX constant to output token balance. Should be used at get() function start
  function maxOutputAmount(uint256 amount) internal view returns (uint256) {
    if (amount == PipeLib.MAX_AMOUNT) {
      return outputBalance();
    } else {
      return amount;
    }
  }

  /// @dev After adding the pipe to a pipeline it should be immediately initialized
  function setPipeline(address _pipeline) external override {
    require(_PIPELINE_SLOT.getAddress() == address(0), "PIPE: Already init");
    _PIPELINE_SLOT.set(_pipeline);
  }

  /// @dev Size of reward tokens array
  function rewardTokensLength() external view override returns (uint) {
    return rewardTokens.length;
  }

  /// @dev function for investing, deposits, entering, borrowing
  /// @param _nextPipe - next pipe in pipeline
  function setNextPipe(address _nextPipe) onlyPipeline override external {
    _NEXT_PIPE_SLOT.set(_nextPipe);
  }

  /// @dev function for investing, deposits, entering, borrowing
  /// @param _prevPipe - next pipe in pipeline
  function setPrevPipe(address _prevPipe) onlyPipeline override external {
    _PREV_PIPE_SLOT.set(_prevPipe);
  }

  /// @dev function for investing, deposits, entering, borrowing. Do not forget to transfer assets to next pipe
  /// @dev In almost all cases overrides should have maxSourceAmount(amount)modifier
  /// @param amount in source units
  /// @return output in underlying units
  function put(uint256 amount) virtual override external returns (uint256 output);

  /// @dev function for de-vesting, withdrawals, leaves, paybacks. Amount in underlying units. Do not forget to transfer assets to prev pipe
  /// @dev In almost all cases overrides should have maxOutputAmount(amount)modifier
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
    address _pipeline = _PIPELINE_SLOT.getAddress();
    for (uint i = 0; i < rewardTokens.length; i++) {
      address rewardToken = rewardTokens[i];
      if (rewardToken == address(0)) {
        return;
      }
      require(_pipeline != address(0));

      uint256 amount = _erc20Balance(rewardToken);
      if (amount > 0) {
        IERC20(rewardToken).safeTransfer(_pipeline, amount);
      }
    }
  }

  /// @dev available source balance (tokens, matic etc).
  /// @return balance in source units
  function sourceBalance() public view virtual override returns (uint256) {
    return _erc20Balance(_SOURCE_TOKEN_SLOT.getAddress());
  }

  /// @dev underlying balance (LP tokens, collateral etc).
  /// @return balance in underlying units
  function outputBalance() public view virtual override returns (uint256) {
    return _erc20Balance(_OUTPUT_TOKEN_SLOT.getAddress());
  }

  /// @notice Pipeline can claim coins that are somehow transferred into the contract
  /// @param recipient Recipient address
  /// @param recipient Token address
  function salvageFromPipe(address recipient, address token) external virtual override onlyPipeline {
    // To make sure that governance cannot come in and take away the coins
    // checking first and last pipes only to have ability salvage tokens from inside pipeline
    if ((!hasPrevPipe() || !hasNextPipe())
      && (_SOURCE_TOKEN_SLOT.getAddress() == token || _OUTPUT_TOKEN_SLOT.getAddress() == token)) {
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
    return _NEXT_PIPE_SLOT.getAddress() != address(0);
  }

  /// @dev Checks is pipe have previous pipe connected
  /// @return true when connected
  function hasPrevPipe() internal view returns (bool) {
    return _PREV_PIPE_SLOT.getAddress() != address(0);
  }

  /// @dev Transfers ERC20 token to next pipe when its exists
  /// @param _token ERC20 token address
  /// @param amount to transfer
  function _transferERC20toNextPipe(address _token, uint256 amount) internal {
    if (amount != 0 && hasNextPipe()) {
      IERC20(_token).safeTransfer(_NEXT_PIPE_SLOT.getAddress(), amount);
    }
  }

  /// @dev Transfers ERC20 token to previous pipe when its exists
  /// @param _token ERC20 token address
  /// @param amount to transfer
  function _transferERC20toPrevPipe(address _token, uint256 amount) internal {
    if (amount != 0 && hasPrevPipe()) {
      IERC20(_token).safeTransfer(_PREV_PIPE_SLOT.getAddress(), amount);
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

  // !!! decrease gap size after adding variables!!!
  //slither-disable-next-line unused-state
  uint[32] private ______gap;
}
