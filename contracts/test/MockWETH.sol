//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";

contract MockWETH is ERC20PresetMinterPauser {

  constructor() ERC20PresetMinterPauser("WETH", "WETH")  {
    _setupDecimals(18);
  }
}
