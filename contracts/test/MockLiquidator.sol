// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../base/interface/ITetuLiquidator.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/IERC20Metadata.sol";

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
    uint dec0 = IERC20Metadata(tokenIn).decimals();
    uint dec1 = IERC20Metadata(tokenOut).decimals();
    IERC20(tokenOut).transfer(msg.sender, amount * (10 ** dec1) / (10 ** dec0));
  }

  function liquidateWithRoute(
    PoolData[] memory route,
    uint amount,
    uint
  ) external override {
    uint dec0 = IERC20Metadata(route[0].tokenIn).decimals();
    uint dec1 = IERC20Metadata(route[route.length - 1].tokenOut).decimals();
    IERC20(route[0].tokenIn).transferFrom(msg.sender, address(this), amount);
    IERC20(route[route.length - 1].tokenOut).transfer(msg.sender, amount * (10 ** dec1) / (10 ** dec0));
  }

}
