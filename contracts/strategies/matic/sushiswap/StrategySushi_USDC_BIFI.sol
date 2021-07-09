//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;


import "../../../base/strategies/masterchef-base/MCv2StrategyFullBuyback.sol";

contract StrategySushi_USDC_BIFI is MCv2StrategyFullBuyback {

  // SUSHI_USDC_BIFI
  address private constant _UNDERLYING = address(0x180237bd326d5245D0898336F54b3c8012c5c62f);
  // USDC
  address private constant TOKEN0 = address(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174);
// BIFI
  address private constant TOKEN1 = address(0xFbdd194376de19a88118e84E279b977f165d01b8);

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
  ) MCv2StrategyFullBuyback(_controller, _UNDERLYING, _vault, sushiPoolRewards, _MASTER_CHEF_REWARD_POOL, 23) {
  }


  function platform() external override pure returns (string memory) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
