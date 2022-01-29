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


import "../../../base/strategies/tomb-base/TombLPStrategyBase.sol";
import "../../../third_party/uniswap/IUniswapV2Pair.sol";

contract StrategyTombLp is TombLPStrategyBase {
  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.TOMB;
  address[] private _assets;
  address private constant _TSHARE_REWARD_POOL = address(0xcc0a87F7e7c693042a9Cc703661F5060c80ACb43);
  address private constant _TSHARE = address(0x4cdF39285D7Ca8eB3f090fDA0C069ba5F4145B37);
  address[] private _poolRewards = [_TSHARE];
  address private constant _ROUTER = address(0xF491e7B69E4244ad4002BC14e878a34207E38c29);

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    address _token0,
    address _token1,
    uint256 _poolId
  ) TombLPStrategyBase(_controller, _underlying, _vault, _poolRewards, _TSHARE_REWARD_POOL, _poolId, _ROUTER) {
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
