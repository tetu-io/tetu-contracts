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


import "../../../base/strategies/masterchef-base/CosmicStrategyBase.sol";
import "../../../third_party/uniswap/IUniswapV2Pair.sol";

contract StrategyCosmicSwapLp is CosmicStrategyBase {

  // MASTER_CHEF
  address public constant _MASTER_CHEF_REWARD_POOL = address(0x7cEFc4449f047FaF16eeD516b80a9E49D3c45F6F);
  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.COSMIC;
  // rewards
  address private constant COSMIC = address(0xa5Eb60CA85898f8b26e18fF7c7E43623ccbA772C);
  address[] private _poolRewards = [COSMIC];
  address[] private _assets;

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    address _token0,
    address _token1,
    uint256 _poolId
  ) CosmicStrategyBase(_controller, _underlying, _vault, _poolRewards, _MASTER_CHEF_REWARD_POOL, _poolId) {
    require(_underlying != address(0), "zero underlying");
    require(_token0 != address(0), "zero token0");
    require(_token1 != address(0), "zero token1");
    require(_token0 != _token1, "same tokens");

    _assets.push(_token0);
    _assets.push(_token1);

    address token0 = IUniswapV2Pair(_underlying).token0();
    address token1 = IUniswapV2Pair(_underlying).token1();
    require(_token0 == token0 || _token0 == token1, "wrong token0");
    require(_token1 == token0 || _token1 == token1, "wrong token1");
  }


  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
