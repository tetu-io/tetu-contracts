//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";

contract MockUSDC is ERC20PresetMinterPauser {

  constructor() ERC20PresetMinterPauser("USDC", "USDC")  {
    _setupDecimals(6);
  }
}
