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

/// @title DepositHelper Interface
/// @dev Interface for contract to hold all token approvals and bath actions
/// @author bogdoslav
interface IDepositHelper {

  struct DepositWithdrawData {
    address vault;
    address underlying;
    uint256 amount;
  }

  struct ZapIntoData {
    address vault;
    address tokenIn;
    address asset;
    bytes routesData;
    uint256 tokenInAmount;
    uint256 slippageTolerance;
  }

  struct ZapOutData {
    address vault;
    address tokenOut;
    address asset;
    bytes routesData;
    uint256 shareTokenAmount;
    uint256 slippageTolerance;
  }

  function setZap(address zapContract2) external;

  /// @dev Bath deposit into the vaults
  function depositToVaults(DepositWithdrawData[] memory deposits)
  external returns (uint256[] memory shareBalances);

  /// @dev Bath withdraw from the vaults
  function withdrawFromVaults(DepositWithdrawData[] memory withdrawals)
  external returns (uint256[] memory underlyingBalances);

  /// @dev Bath zap into the vaults
  function zapIntoVaults(ZapIntoData[] memory deposits)
  external returns (uint256[] memory shareBalances);

  /// @dev Bath zap out the vaults
  function zapOutVaults(ZapOutData[] memory withdrawals)
  external returns (uint256[] memory underlyingBalances);

}
