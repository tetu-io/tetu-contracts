//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "../base/interface/ISmartVault.sol";


contract EvilHackerContract {

  function tryDeposit(address vault, uint256 amount) public {
    ISmartVault(vault).deposit(amount);
  }

}
