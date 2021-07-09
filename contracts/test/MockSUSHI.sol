//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";

contract MockSUSHI is ERC20PresetMinterPauser {

  constructor() ERC20PresetMinterPauser("SUSHI", "SUSHI")  {
    _setupDecimals(18);
  }
}
