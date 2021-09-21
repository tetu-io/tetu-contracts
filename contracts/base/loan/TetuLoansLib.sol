// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "./ITetuLoans.sol";

/// @title Library for Tetu loans specific functions
/// @author belbix
library TetuLoansLib {

  /// @dev Remove from array the item with given id and move the last item on it place
  ///      Use with mapping for keeping indexes in correct ordering
  function removeIndexed(
    uint256[] storage array,
    mapping(uint256 => uint256) storage indexes,
    uint256 id
  ) internal {
    uint256 lastId = array[array.length - 1];
    uint256 index = indexes[id];
    indexes[lastId] = index;
    indexes[id] = type(uint256).max;
    array[index] = lastId;
    array.pop();
  }

}
