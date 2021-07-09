//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";

contract MockQUICK is ERC20PresetMinterPauser {

  constructor() ERC20PresetMinterPauser("Mock QUICK", "QUICK")  {
    _setupDecimals(18);
  }
}
