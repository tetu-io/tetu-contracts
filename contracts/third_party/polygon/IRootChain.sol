// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

interface IRootChain {

  struct HeaderBlock {
    bytes32 root;
    uint256 start;
    uint256 end;
    uint256 createdAt;
    address proposer;
  }

  function slash() external;

  function submitHeaderBlock(bytes calldata data, bytes calldata sigs)
  external;

  function submitCheckpoint(bytes calldata data, uint[3][] calldata sigs)
  external;

  function getLastChildBlock() external view returns (uint256);

  function currentHeaderBlock() external view returns (uint256);

  function headerBlocks(uint value) external view returns (HeaderBlock memory);
}
