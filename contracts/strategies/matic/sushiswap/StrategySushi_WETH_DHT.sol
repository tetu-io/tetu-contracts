//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;


import "../../../base/strategies/masterchef-base/MCv2StrategyFullBuyback.sol";

contract StrategySushi_WETH_DHT is MCv2StrategyFullBuyback {

  // SUSHI_WETH_DHT
  address private constant _UNDERLYING = address(0xa375d23a751124359568f3a22576528bD1C8C3e3);
  // WETH
  address private constant TOKEN0 = address(0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619);
// DHT
  address private constant TOKEN1 = address(0x8C92e38eCA8210f4fcBf17F0951b198Dd7668292);

  // SUSHI_MASTER_CHEF
  address public constant _MASTER_CHEF_REWARD_POOL = address(0x0769fd68dFb93167989C6f7254cd0D766Fb2841F);
  string private constant _PLATFORM = "SUSHI";
  // rewards
  address private constant SUSHI = address(0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a);
  address private constant WMATIC = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
  address[] private sushiPoolRewards = [SUSHI, WMATIC];
  address[] private _assets = [TOKEN0, TOKEN1];

  constructor(
    address _controller,
    address _vault
  ) MCv2StrategyFullBuyback(_controller, _UNDERLYING, _vault, sushiPoolRewards, _MASTER_CHEF_REWARD_POOL, 19) {
  }


  function platform() external override pure returns (string memory) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
