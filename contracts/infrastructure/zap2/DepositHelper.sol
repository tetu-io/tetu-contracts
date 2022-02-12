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

import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../../base/interface/ISmartVault.sol";
import "./IMultiSwap2.sol";
import "./IZapContract2.sol";
import "./IDepositHelper.sol";

/// @title DepositHelper
/// @dev Contract to hold all token approvals and bath actions
/// @author bogdoslav
contract DepositHelper is IDepositHelper {
  using SafeERC20 for IERC20;

  IZapContract2 zap;

  /// @dev Restrict indirect calls (calls from contracts)
  modifier onlyDirectCall() {
    require(msg.sender == tx.origin, "DH: Indirect calls restricted");
    _;
  }

  constructor(address _zapContract2) {
    require(_zapContract2 != address(0), 'DH: Zap contract is not set');
    zap = IZapContract2(_zapContract2);
  }

  /// @dev Bath deposit into the vaults
  function depositToVaults(DepositWithdrawData[] memory deposits)
  external override onlyDirectCall returns (uint256[] memory shareBalances) {
    uint len = deposits.length;
    require(len != 0, 'DH: Empty data array');
    shareBalances = new uint256[](len);

    for (uint i = 0; i < len; i++) {
      DepositWithdrawData memory d = deposits[i];
      shareBalances[i] = _depositToVault(d.vault, d.underlying, d.amount);
    }
  }

  /// @dev Bath withdraw from the vaults
  function withdrawFromVaults(DepositWithdrawData[] memory withdrawals)
  external override onlyDirectCall returns (uint256[] memory underlyingBalances) {
    uint len = withdrawals.length;
    require(len != 0, 'DH: Empty data array');
    underlyingBalances = new uint256[](len);

    for (uint i = 0; i < len; i++) {
      DepositWithdrawData memory d = withdrawals[i];
      underlyingBalances[i] = _withdrawFromVault(d.vault, d.underlying, d.amount);
    }
  }

  /// @dev Bath zap into the vaults
  function zapIntoVaults(ZapIntoData[] memory deposits)
  external override onlyDirectCall returns (uint256[] memory shareBalances) {
    uint len = deposits.length;
    require(len != 0, 'DH: Empty data array');
    shareBalances = new uint256[](len);

    for (uint i = 0; i < len; i++) {
      ZapIntoData memory d = deposits[i];
      shareBalances[i] = _zapIntoVault(d);
    }
  }

  /// @dev Bath zap out the vaults
  function zapOutVaults(ZapOutData[] memory withdrawals)
  external override onlyDirectCall returns (uint256[] memory underlyingBalances) {
    uint len = withdrawals.length;
    require(len != 0, 'DH: Empty data array');
    underlyingBalances = new uint256[](len);

    for (uint i = 0; i < len; i++) {
      ZapOutData memory d = withdrawals[i];
      underlyingBalances[i] = _zapOutVault(d);
    }
  }

  // ************************* INTERNAL *******************

  /// @dev Deposit into the vault, check the result and send share token to msg.sender
  function _depositToVault(address _vault, address _underlying, uint _amount)
  internal returns (uint shareBalance) {
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
  function _withdrawFromVault(address _vault, address _underlying, uint _amount)
  internal returns (uint underlyingBalance) {
    ISmartVault(_vault).withdraw(_amount);

    underlyingBalance = IERC20(_underlying).balanceOf(address(this));
    require(underlyingBalance != 0, "DH: zero underlying balance");

    IERC20(_underlying).safeTransfer(msg.sender, underlyingBalance);
  }

  /// @dev Deposit into the vault, check the result and send share token to msg.sender
  function _zapIntoVault(ZapIntoData memory d) internal returns (uint shareBalance){
    require(ISmartVault(d.vault).underlying() == d.tokenIn, "DH: wrong lp for vault");

    IERC20(d.tokenIn).safeTransferFrom(msg.sender, address(this), d.tokenInAmount);
    IERC20(d.tokenIn).safeApprove(d.vault, 0);
    IERC20(d.tokenIn).safeApprove(d.vault, d.tokenInAmount);
    zap.zapInto(d.vault, d.tokenIn, d.asset, d.routesData, d.tokenInAmount, d.slippageTolerance);

    shareBalance = IERC20(d.vault).balanceOf(address(this));
    require(shareBalance != 0, "DH: zero shareBalance");

    IERC20(d.vault).safeTransfer(msg.sender, shareBalance);
  }

  /// @dev Withdraw from vault, check the result and send token to msg.sender
  function _zapOutVault(ZapOutData memory d)
  internal returns (uint underlyingBalance) {
    zap.zapOut(d.vault, d.tokenOut, d.asset, d.routesData, d.shareTokenAmount, d.slippageTolerance);

    underlyingBalance = IERC20(d.tokenOut).balanceOf(address(this));
    require(underlyingBalance != 0, "DH: zero underlying balance");

    IERC20(d.tokenOut).safeTransfer(msg.sender, underlyingBalance);
  }

}
