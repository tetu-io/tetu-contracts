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


import "../../../base/strategies/aave/AaveFoldStrategyBase.sol";

contract StrategyAaveFold is AaveFoldStrategyBase {

  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.AAVE_LEND;

  address private constant WMATIC = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
  address public constant AAVE_LENDING_POOL = 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf;
  address public constant AAVE_CONTROLLER = 0x357D51124f59836DeD84c8a1730D72B749d8BC23;
  address public constant AAVE_DATA_PROVIDER = 0x7551b5D2763519d4e37e8B81929D336De671d46d;
  address public constant AAVE_LENDING_POOL_ADDRESSES_PROVIDER = 0xd05e3E715d945B59290df0ae8eF85c1BdB684744;

  AaveData private _aaveData = AaveData(
    WMATIC,
    AAVE_LENDING_POOL,
    AAVE_CONTROLLER,
    AAVE_DATA_PROVIDER,
    AAVE_LENDING_POOL_ADDRESSES_PROVIDER
  );

  address[] private _poolRewards = [WMATIC];
  address[] private _assets;

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator
  ) AaveFoldStrategyBase(
    _controller,
    _underlying,
    _vault,
    _poolRewards,
    _borrowTargetFactorNumerator,
    _collateralFactorNumerator,
    _aaveData
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
