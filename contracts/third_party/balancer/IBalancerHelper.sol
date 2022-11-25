// SPDX-License-Identifier: ISC
pragma solidity 0.8.4;

interface IBalancerHelper {
  function queryExit(
    bytes32 poolId,
    address sender,
    address recipient,
    IVault.JoinPoolRequest memory request
  ) external returns (uint256 bptIn, uint256[] memory amountsOut);

  function queryJoin(
    bytes32 poolId,
    address sender,
    address recipient,
    IVault.JoinPoolRequest memory request
  ) external returns (uint256 bptOut, uint256[] memory amountsIn);

  function vault() external view returns (address);
}

interface IVault {
  struct JoinPoolRequest {
    address[] assets;
    uint256[] maxAmountsIn;
    bytes userData;
    bool fromInternalBalance;
  }
}
