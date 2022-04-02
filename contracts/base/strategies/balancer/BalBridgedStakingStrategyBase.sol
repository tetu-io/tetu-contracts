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

import "../ProxyStrategyBase.sol";
import "../../../third_party/IERC20Extended.sol";
import "../../../third_party/IDelegation.sol";
import "../../SlotsLib.sol";
import "../../../third_party/curve/IVotingEscrow.sol";
import "../../../third_party/curve/IVotingEscrowDelegation.sol";

/// @title Base contract for sending assets to bridge and receive rewards
/// @author belbix
abstract contract BalBridgedStakingStrategyBase is ProxyStrategyBase {
  using SafeERC20 for IERC20;
  using SlotsLib for bytes32;

  // --------------------- CONSTANTS -------------------------------
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "BalBridgedStakingStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev 10% buybacks
  uint256 private constant _BUY_BACK_RATIO = 10_00;
  bytes32 internal constant _SENDER_KEY = bytes32(uint256(keccak256("s.sender")) - 1);
  bytes32 internal constant _INVESTED_KEY = bytes32(uint256(keccak256("s.invested")) - 1);


  /// @notice Initialize contract after setup it as proxy implementation
  function initializeStrategy(
    address controller_,
    address underlying_,
    address vault_,
    address[] memory rewardTokens_,
    address sender_
  ) public initializer {
    _SENDER_KEY.set(sender_);
    ProxyStrategyBase.initializeStrategyBase(
      controller_,
      underlying_,
      vault_,
      rewardTokens_,
      _BUY_BACK_RATIO
    );
  }


  // --------------------------------------------

  /// @dev Exit from BPT and transfer tokens to sender
  function _sendToBridge() internal {
    // todo
    // write BPT balance that was sent on sender
    _INVESTED_KEY.set(uint(0));
  }

  // --------------------------------------------

  /// @notice Return only pool balance. Assume that we ALWAYS invest on vault deposit action
  function investedUnderlyingBalance() external override view returns (uint) {
    return _rewardPoolBalance();
  }

  /// @dev Returns underlying balance in the pool
  function _rewardPoolBalance() internal override view returns (uint256) {
    return _INVESTED_KEY.getUint();
  }

  /// @dev Collect profit and do something useful with them
  function doHardWork() external override {

    // we should receive periodically BAL tokens from mainnet
    // wrap them into vault shares and send as rewards to the vault
    // todo
  }

  /// @dev Stake underlying to the pool with maximum lock period
  function depositToPool(uint256 amount) internal override {
    if (amount > 0) {
      _sendToBridge();
    }
  }

  /// @dev We will not able to withdraw from the pool
  function withdrawAndClaimFromPool(uint256) internal pure override {
    revert("BBSS: Withdraw forbidden");
  }

  /// @dev Not able to withdraw in any form
  function emergencyWithdrawFromPool() internal pure override {
    revert("BBSS: Withdraw forbidden");
  }

  /// @dev No claimable tokens
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    return toClaim;
  }

  /// @dev Assume that sent tokes is the whole pool balance
  function poolTotalAmount() external view override returns (uint256) {
    return _INVESTED_KEY.getUint();
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.BALANCER;
  }

  function liquidateReward() internal pure override {
    // todo
  }

}
