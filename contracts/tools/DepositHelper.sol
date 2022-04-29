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
import "../base/governance/ControllableV2.sol";
import "../base/interface/ISmartVault.sol";
import "../base/interface/IController.sol";

/// @title Helper Contract to deposit/withdraw to/from SmartVault.
/// @author belbix, bogdoslav
contract DepositHelper is ControllableV2, ReentrancyGuard {
  using SafeERC20 for IERC20;

  string public constant VERSION = "1.0.0";

  mapping(address => uint256) calls;
  mapping(address => bool) whitelist;

  constructor(address controller_) {
    ControllableV2.initializeControllable(controller_);
  }

  modifier onlyOneCallPerBlock() {
    require(calls[msg.sender] < block.number, "DH: call in the same block forbidden");
    _;
    calls[msg.sender] = block.number;
  }

  modifier onlyWhitelisted() {
    require(whitelist[msg.sender], "DH: not whitelisted");
    _;
  }

  modifier onlyControllerOrGov() {
    require(_isController(msg.sender) || _isGovernance(msg.sender), "DH: Not controller or gov");
    _;
  }

  // ******************** USERS ACTIONS *********************

  /// @notice Deposits to vault specified underlying token amount. Caller receives share tokens.
  /// @dev Approval for share token is assumed.
  /// @param vault_ A target vault for deposit
  /// @param underlyingAmount_ Amount of vault's underlying token for deposit
  function depositToVault(
    address vault_,
    uint256 underlyingAmount_
  ) external nonReentrant onlyOneCallPerBlock onlyWhitelisted {
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
  /// @dev Approval for share token is assumed.
  /// @param vault_ A target vault for deposit
  /// @param shareTokenAmount_ Amount of vault's share token to withdraw
  function withdrawFromVault(
    address vault_,
    uint256 shareTokenAmount_
  ) external nonReentrant onlyOneCallPerBlock onlyWhitelisted {
    require(shareTokenAmount_ != 0, "DH: zero amount");

    IERC20(vault_).safeTransferFrom(msg.sender, address(this), shareTokenAmount_);

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

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param token_ Token address
  /// @param amount_ Token amount
  function salvage(address token_, uint256 amount_) external onlyControllerOrGov {
    IERC20(token_).safeTransfer(msg.sender, amount_);
  }

  /// @notice Whitelist a caller address
  /// @param caller_ Caller address
  function addToWhitelist(address caller_) external onlyControllerOrGov {
    whitelist[caller_] = true;
  }

  /// @notice Remove a caller from the whitelist
  /// @param caller_ Caller address
  function removeFromWhitelist(address caller_) external onlyControllerOrGov {
    delete whitelist[caller_];
  }

}
