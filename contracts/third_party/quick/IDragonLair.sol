// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../../openzeppelin/IERC20.sol";

interface IDragonLair {

  function quick() external view returns (IERC20);

  // Enter the lair. Pay some QUICK. Earn some dragon QUICK.
  function enter(uint256 _quickAmount) external;

  // Leave the lair. Claim back your QUICK.
  function leave(uint256 _dQuickAmount) external;

  // returns the total amount of QUICK an address has in the contract including fees earned
  function QUICKBalance(address _account) external view returns (uint256 quickAmount_);

  //returns how much QUICK someone gets for depositing dQUICK
  function dQUICKForQUICK(uint256 _dQuickAmount) external view returns (uint256 quickAmount_);

  //returns how much dQUICK someone gets for depositing QUICK
  function QUICKForDQUICK(uint256 _quickAmount) external view returns (uint256 dQuickAmount_);
}
