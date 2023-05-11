// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../base/interfaces/ITetuLiquidator.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/IERC20Metadata.sol";

import "hardhat/console.sol";

contract MockLiquidator is ITetuLiquidator {

  uint price = 100_000 * 1e18;
  string error = "";
  uint routeLength = 1;

  function setPrice(uint value) external {
    price = value;
  }

  function setError(string memory value) external {
    error = value;
  }

  function setRouteLength(uint value) external {
    routeLength = value;
  }

  function addBlueChipsPools(PoolData[] memory /*_pools*/, bool /*rewrite*/) external override {
    // noop
  }

  function addLargestPools(PoolData[] memory /*_pools*/, bool /*rewrite*/) external override {
    // noop
  }

  function getPrice(address, address, uint) external view override returns (uint) {
    return price;
  }

  function getPriceForRoute(PoolData[] memory, uint) external view override returns (uint) {
    return price;
  }

  function isRouteExist(address, address) external pure override returns (bool) {
    return true;
  }

  function buildRoute(
    address tokenIn,
    address tokenOut
  ) external view override returns (PoolData[] memory route, string memory errorMessage) {
    if (routeLength == 1) {
      route = new PoolData[](1);
      route[0].tokenIn = tokenIn;
      route[0].tokenOut = tokenOut;
    } else {
      route = new PoolData[](0);
    }
    return (route, error);
  }

  function liquidate(
    address tokenIn,
    address tokenOut,
    uint amount,
    uint
  ) external override {
    console.log("liquidate amount", amount);
    console.log("liquidate tokenIn", IERC20Metadata(tokenIn).symbol());
    console.log("liquidate tokenOut", IERC20Metadata(tokenOut).symbol());
    uint dec0 = IERC20Metadata(tokenIn).decimals();
    uint dec1 = IERC20Metadata(tokenOut).decimals();
    uint amountOut = amount * (10 ** dec1) / (10 ** dec0);
    console.log("liquidateWithRoute amountOut", amountOut);
    console.log("liquidateWithRoute out balance", IERC20(tokenOut).balanceOf(address(this)));
    IERC20(tokenOut).transfer(msg.sender, amountOut);
  }

  function liquidateWithRoute(
    PoolData[] memory route,
    uint amount,
    uint
  ) external override {
    console.log("liquidateWithRoute amount", amount);
    console.log("liquidateWithRoute tokenIn", IERC20Metadata(route[0].tokenIn).symbol());
    console.log("liquidateWithRoute tokenOut", IERC20Metadata(route[route.length - 1].tokenOut).symbol());
    uint dec0 = IERC20Metadata(route[0].tokenIn).decimals();
    uint dec1 = IERC20Metadata(route[route.length - 1].tokenOut).decimals();
    IERC20(route[0].tokenIn).transferFrom(msg.sender, address(this), amount);
    uint amountOut = amount * (10 ** dec1) / (10 ** dec0);
    console.log("liquidateWithRoute amountOut", amountOut);
    console.log("liquidateWithRoute out balance", IERC20(route[route.length - 1].tokenOut).balanceOf(address(this)));
    IERC20(route[route.length - 1].tokenOut).transfer(msg.sender, amountOut);
  }

}
