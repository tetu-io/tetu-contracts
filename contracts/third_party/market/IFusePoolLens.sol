// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IFusePoolLens {

  struct FusePool {
    string name;
    address creator;
    address comptroller;
    uint blockPosted;
    uint timestampPosted;
  }

  struct FusePoolAsset {
    address cToken;
    address underlyingToken;
    string underlyingName;
    string underlyingSymbol;
    uint underlyingDecimals;
    uint underlyingBalance;
    uint supplyRatePerBlock;
    uint borrowRatePerBlock;
    uint totalSupply;
    uint totalBorrow;
    uint supplyBalance;
    uint borrowBalance;
    uint liquidity;
    bool membership;
    uint exchangeRate;
    uint underlyingPrice;
    address oracle;
    uint collateralFactor;
    uint reserveFactor;
    uint adminFee;
    uint fuseFee;
  }

  struct FusePoolUser {
    address account;
    uint totalBorrow;
    uint totalCollateral;
    uint health;
    FusePoolAsset assets;
  }

  struct CTokenOwnership {
    address cToken;
    address admin;
    bool adminHasRights;
    bool fuseAdminHasRights;
  }

  function directory (  ) external view returns ( address );
  function initialize ( address _directory ) external;
  function getPublicPoolsWithData (  ) external returns ( uint[] memory, FusePool[] memory, uint[] memory, uint[] memory, address[][] memory, string[][] memory, bool[] memory );
  function getPoolsByAccountWithData ( address account ) external returns ( uint[] memory, FusePool[] memory, uint[] memory, uint[] memory, address[][] memory, string[][] memory, bool[] memory );
  function getPoolSummary ( address comptroller ) external returns ( uint, uint, address[] memory, string[] memory );
  function getPoolAssetsWithData ( address comptroller ) external returns ( FusePoolAsset[] memory );
  function getPublicPoolUsersWithData ( uint maxHealth ) external returns ( address[] memory, FusePoolUser[][] memory, uint[] memory, uint[] memory, bool[] memory );
  function getPoolUsersWithData ( address[] calldata comptrollers, uint maxHealth ) external returns ( FusePoolUser[][] memory, uint[] memory, uint[] memory );
  function getPoolUsersWithData ( address comptroller, uint maxHealth ) external returns ( FusePoolUser[] memory, uint, uint );
  function getPoolsBySupplier ( address account ) external view returns ( uint[] memory, FusePool[] memory );
  function getPoolsBySupplierWithData ( address account ) external returns ( uint[] memory, FusePool[] memory, uint[] memory, uint[] memory, address[][] memory, string[][] memory, bool[] memory );
  function getUserSummary ( address account ) external returns ( uint, uint, bool );
  function getPoolUserSummary ( address comptroller, address account ) external returns ( uint, uint );
  function getWhitelistedPoolsByAccount ( address account ) external view returns ( uint[] memory, FusePool[] memory );
  function getWhitelistedPoolsByAccountWithData ( address account ) external returns ( uint[] memory, FusePool[] memory, uint[] memory, uint[] memory, address[][] memory, string[][] memory, bool[] memory );
  function getPoolOwnership ( address comptroller ) external view returns ( address, bool, bool, CTokenOwnership[] memory );
}
