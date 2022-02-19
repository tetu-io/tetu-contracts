// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IFusePoolDirectory {

  struct FusePool {
    string name;
    address creator;
    address comptroller;
    uint blockPosted;
    uint timestampPosted;
  }

  function deployerWhitelist ( address ) external view returns ( bool );
  function enforceDeployerWhitelist (  ) external view returns ( bool );
  function owner (  ) external view returns ( address );
  function poolExists ( address ) external view returns ( bool );
  function pools ( uint256 ) external view returns ( FusePool memory );
  function _setDeployerWhitelistEnforcement ( bool _enforceDeployerWhitelist ) external;
  function _whitelistDeployers ( address[] memory deployers ) external;
  function getAllPools (  ) external view returns ( FusePool[] memory);
  function getPublicPools (  ) external view returns ( uint256[] memory, FusePool[] memory);
  function getPoolsByAccount ( address account ) external view returns ( uint256[] memory, FusePool[] memory);
  function getBookmarks ( address account ) external view returns ( address[] memory);
  function bookmarkPool ( address comptroller ) external;
}