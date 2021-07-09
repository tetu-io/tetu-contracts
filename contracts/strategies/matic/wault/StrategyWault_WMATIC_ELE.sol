//SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;


import "../../../base/strategies/masterchef-base/WaultStrategyFullBuyback.sol";

contract StrategyWault_WMATIC_ELE is WaultStrategyFullBuyback {

  // WAULT_WMATIC_ELE
  address private constant _UNDERLYING = address(0xFd5D691EE53982fb96B56a1f3fE0ee0ca0Fd9218);
  // WMATIC
  address private constant TOKEN0 = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
  // ELE
  address private constant TOKEN1 = address(0xAcD7B3D9c10e97d0efA418903C0c7669E702E4C0);

  // WexPolyMaster
  address public constant WEX_POLY_MASTER = address(0xC8Bd86E5a132Ac0bf10134e270De06A8Ba317BFe);
  string private constant _PLATFORM = "WAULT";
  // rewards
  address private constant WEXpoly = address(0x4c4BF319237D98a30A929A96112EfFa8DA3510EB);
  address[] private poolRewards = [WEXpoly];
  address[] private _assets = [TOKEN0, TOKEN1];

  constructor(
    address _controller,
    address _vault
  ) WaultStrategyFullBuyback(_controller, _UNDERLYING, _vault, poolRewards, WEX_POLY_MASTER, 17) {
  }


  function platform() external override pure returns (string memory) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
