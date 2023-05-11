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

import "../openzeppelin/IERC20.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../base/interfaces/ISmartVault.sol";

/// @title Helper Contract to deposit/withdraw to/from SmartVault.
/// @author belbix, bogdoslav
contract DepositHelper is ReentrancyGuard {
  using SafeERC20 for IERC20;

  string public constant VERSION = "1.0.0";

  mapping(address => mapping(address => uint256)) calls;

  modifier onlyOneCallPerBlockPerVault(address vault_) {
    require(calls[msg.sender][vault_] < block.number, "DH: call in the same block forbidden");
    _;
    calls[msg.sender][vault_] = block.number;
  }

  // ******************** USERS ACTIONS *********************

  /// @notice Deposits to vault specified underlying token amount. Caller receives share tokens.
  /// @dev Approval for share token is assumed.
  /// @param vault_ A target vault for deposit
  /// @param underlyingAmount_ Amount of vault's underlying token for deposit
  function depositToVault(address vault_, uint256 underlyingAmount_)
  external nonReentrant onlyOneCallPerBlockPerVault(vault_) {
    require(underlyingAmount_ > 1, "DH: not enough amount");

    address underlying = ISmartVault(vault_).underlying();
    IERC20(underlying).safeTransferFrom(msg.sender, address(this), underlyingAmount_);

    IERC20(underlying).safeApprove(vault_, 0);
    IERC20(underlying).safeApprove(vault_, underlyingAmount_);
    ISmartVault(vault_).depositAndInvest(underlyingAmount_);

    uint256 shareBalance = IERC20(vault_).balanceOf(address(this));
    require(shareBalance != 0, "DH: zero shareBalance");

    IERC20(vault_).safeTransfer(msg.sender, shareBalance);

    // send change (if any) back
    uint256 underlyingBalance = IERC20(underlying).balanceOf(address(this));
    if (underlyingBalance > 0) {
      IERC20(underlying).safeTransfer(msg.sender, underlyingBalance);
    }
  }

  /// @notice Withdraws from vault specified share amount. Caller receives underlying token.
  /// @dev Approval for UINT_MAX share token is assumed.
  /// @param vault_ A target vault withdraw from
  /// @param shareTokenAmount_ Amount of vault's share token to withdraw
  function withdrawFromVault(address vault_, uint256 shareTokenAmount_)
  external nonReentrant onlyOneCallPerBlockPerVault(vault_) {
    require(shareTokenAmount_ != 0, "DH: zero amount");

    IERC20(vault_).safeTransferFrom(msg.sender, address(this), shareTokenAmount_);

    _claimAndSendAllRewards(vault_);
    ISmartVault(vault_).withdraw(shareTokenAmount_);

    address underlying = ISmartVault(vault_).underlying();
    uint256 underlyingBalance = IERC20(underlying).balanceOf(address(this));
    require(underlyingBalance != 0, "DH: zero underlying balance");

    IERC20(underlying).safeTransfer(msg.sender, underlyingBalance);


    // send change (if any) back
    uint256 shareBalance = IERC20(vault_).balanceOf(address(this));
    if (shareBalance > 0) {
      IERC20(vault_).safeTransfer(msg.sender, shareBalance);
    }
  }

  /// @notice Claims rewards from vault. Caller receives all reward tokens.
  /// @dev Approval for UINT_MAX share token is assumed.
  /// @param vault_ A target vault to claim rewards from
  function getAllRewards(address vault_)
  external nonReentrant {
    _claimAndSendAllRewards(vault_);
  }

  // ************************* INTERNAL *******************

  /// @notice Claims and transfers all reward tokens to msg.sender
  /// @param vault_ A target vault to claim rewards from
  function _claimAndSendAllRewards(address vault_)
  internal {
    ISmartVault(vault_).getAllRewardsFor(msg.sender);
  }

  // ************************* ACTIONS *******************

  /// @notice Claim coins that are somehow transferred into the contract
  /// @param token_ Token address
  /// @param amount_ Token amount
  function salvage(address token_, uint256 amount_) external {
    IERC20(token_).safeTransfer(msg.sender, amount_);
  }


}
