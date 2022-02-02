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
import "../../base/governance/Controllable.sol";
import "../../base/interface/ISmartVault.sol";
import "./IZapContract2.sol";

//import "hardhat/console.sol"; // TODO remove

/// @title DepositHelper
/// @dev Contract to hold all token approvals and bath actions
/// @author bogdoslav
contract DepositHelper is Controllable /*is IDepositHelper*/ {// TODO interface
  using SafeERC20 for IERC20;

  IZapContract2 zap;

  struct DepositWithdrawData {
    address vault;
    address underlying;
    uint256 amount;
  }

  struct ZapIntoData {
    address vault;
    address tokenIn;
    address asset;
    address[] assetRoute; // TODO data for new multi swap
    uint256 tokenInAmount;
    uint256 slippageTolerance;
  }

  struct ZapOutData {
    address vault;
    address tokenOut;
    address asset;
    address[] assetRoute;
    uint256 shareTokenAmount;
    uint256 slippageTolerance;
  }

  /// @dev Restrict indirect calls (calls from contracts)
  modifier onlyDirectCall() {
    require(msg.sender == tx.origin, "DH: Indirect calls restricted");
    _;
  }

  constructor(address _controller, address _zapContract2) {
    Controllable.initializeControllable(_controller);
    _setZap(_zapContract2);
  }

  function setZap(address zapContract2)
  external onlyControllerOrGovernance {
    _setZap(zapContract2);
  }

  function _setZap(address zapContract2)
  internal {
    require(zapContract2 != address(0), 'DH: Zap contract is not set');
    zap = IZapContract2(zapContract2);
  }

  /// @dev Bath deposit into the vaults
  function depositToVaults(DepositWithdrawData[] memory deposits)
  external onlyDirectCall returns (uint256[] memory shareBalances) {
    uint len = deposits.length;
    require(len != 0, 'DH: Empty data array');
    shareBalances = new uint256[](len);

    for (uint256 i = 0; i < len; i++) {
      DepositWithdrawData memory d = deposits[i];
      shareBalances[i] = depositToVault(d.vault, d.underlying, d.amount);
    }
  }

  /// @dev Bath withdraw from the vaults
  function withdrawFromVaults(DepositWithdrawData[] memory withdrawals)
  external onlyDirectCall returns (uint256[] memory underlyingBalances) {
    uint len = withdrawals.length;
    require(len != 0, 'DH: Empty data array');
    underlyingBalances = new uint256[](len);

    for (uint256 i = 0; i < len; i++) {
      DepositWithdrawData memory d = withdrawals[i];
      underlyingBalances[i] = withdrawFromVault(d.vault, d.underlying, d.amount);
    }
  }

  /// @dev Bath zap into the vaults
  function zapIntoVaults(ZapIntoData[] memory deposits)
  external onlyDirectCall returns (uint256[] memory shareBalances) {
    uint len = deposits.length;
    require(len != 0, 'DH: Empty data array');
    shareBalances = new uint256[](len);

    for (uint256 i = 0; i < len; i++) {
      ZapIntoData memory d = deposits[i];
      shareBalances[i] = zapIntoVault(d);
    }
  }

  /// @dev Bath zap out the vaults
  function zapOutVaults(ZapOutData[] memory withdrawals)
  external onlyDirectCall returns (uint256[] memory underlyingBalances) {
    uint len = withdrawals.length;
    require(len != 0, 'DH: Empty data array');
    underlyingBalances = new uint256[](len);

    for (uint256 i = 0; i < len; i++) {
      ZapOutData memory d = withdrawals[i];
      underlyingBalances[i] = zapOutVault(d);
    }
  }

  // ************************* INTERNAL *******************

  /// @dev Deposit into the vault, check the result and send share token to msg.sender
  function depositToVault(address _vault, address _underlying, uint256 _amount)
  internal returns (uint256 shareBalance) {
    require(ISmartVault(_vault).underlying() == _underlying, "DH: wrong lp for vault");

    IERC20(_underlying).safeTransferFrom(msg.sender, address(this), _amount);
    IERC20(_underlying).safeApprove(_vault, 0);
    IERC20(_underlying).safeApprove(_vault, _amount);
    ISmartVault(_vault).depositAndInvest(_amount);

    shareBalance = IERC20(_vault).balanceOf(address(this));
    require(shareBalance != 0, "DH: zero shareBalance");

    IERC20(_vault).safeTransfer(msg.sender, shareBalance);
  }

  /// @dev Withdraw from vault, check the result and send token to msg.sender
  function withdrawFromVault(address _vault, address _underlying, uint256 _amount)
  internal returns (uint256 underlyingBalance) {
    ISmartVault(_vault).withdraw(_amount);

    underlyingBalance = IERC20(_underlying).balanceOf(address(this));
    require(underlyingBalance != 0, "DH: zero underlying balance");

    IERC20(_underlying).safeTransfer(msg.sender, underlyingBalance);
  }

  /// @dev Deposit into the vault, check the result and send share token to msg.sender
  function zapIntoVault(ZapIntoData memory d) internal returns (uint256 shareBalance){
    require(ISmartVault(d.vault).underlying() == d.tokenIn, "DH: wrong lp for vault");

    IERC20(d.tokenIn).safeTransferFrom(msg.sender, address(this), d.tokenInAmount);
    IERC20(d.tokenIn).safeApprove(d.vault, 0);
    IERC20(d.tokenIn).safeApprove(d.vault, d.tokenInAmount);
    zap.zapInto(d.vault, d.tokenIn, d.asset, d.assetRoute, d.tokenInAmount, d.slippageTolerance);

    shareBalance = IERC20(d.vault).balanceOf(address(this));
    require(shareBalance != 0, "DH: zero shareBalance");

    IERC20(d.vault).safeTransfer(msg.sender, shareBalance);
  }

  /// @dev Withdraw from vault, check the result and send token to msg.sender
  function zapOutVault(ZapOutData memory d)
  internal returns (uint256 underlyingBalance) {
    zap.zapOut(d.vault, d.tokenOut, d.asset, d.assetRoute, d.shareTokenAmount, d.slippageTolerance);

    underlyingBalance = IERC20(d.tokenOut).balanceOf(address(this));
    require(underlyingBalance != 0, "DH: zero underlying balance");

    IERC20(d.tokenOut).safeTransfer(msg.sender, underlyingBalance);
  }

}
