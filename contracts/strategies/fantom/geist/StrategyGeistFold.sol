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


import "../../../base/strategies/geist/GeistFoldStrategyBase.sol";

contract StrategyGeistFold is GeistFoldStrategyBase {

  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.GEIST;

  address private constant GEIST = address(0xd8321AA83Fb0a4ECd6348D4577431310A6E0814d);
  address private constant WFTM = address(0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83);
  address public constant AAVE_LENDING_POOL = 0x9FAD24f572045c7869117160A571B2e50b10d068;
  address public constant CHEF_INCENTIVES_CONTROLLER = 0x297FddC5c33Ef988dd03bd13e162aE084ea1fE57;
  address public constant AAVE_DATA_PROVIDER = 0xf3B0611e2E4D2cd6aB4bb3e01aDe211c3f42A8C3;
  address public constant AAVE_LENDING_POOL_ADDRESSES_PROVIDER = 0x6c793c628Fe2b480c5e6FB7957dDa4b9291F9c9b;

  GeistData private _geistData = GeistData(
    WFTM,
    AAVE_LENDING_POOL,
    CHEF_INCENTIVES_CONTROLLER,
    AAVE_DATA_PROVIDER,
    AAVE_LENDING_POOL_ADDRESSES_PROVIDER
  );

  address[] private _poolRewards = [GEIST];
  address[] private _assets;

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator
  ) GeistFoldStrategyBase(
    _controller,
    _underlying,
    _vault,
    _poolRewards,
    _borrowTargetFactorNumerator,
    _collateralFactorNumerator,
    _geistData
  ) {
    require(_underlying != address(0), "zero underlying");
    _assets.push(_underlying);
  }


  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
