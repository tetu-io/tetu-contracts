// SPDX-License-Identifier: ISC

pragma solidity 0.8.4;

import "../base/ArrayLib.sol";

contract ArrayLibTest {
  using ArrayLib for address[];
  using ArrayLib for uint256[];

  uint256[] uintArray;
  address[] addressArray;
  mapping(address => uint) uintMap;

  function containsUint(
    uint256[] calldata _uint,
    uint256 value
  ) public returns (bool) {
    delete uintArray;
    for (uint i = 0; i < _uint.length; i++) {
      uintArray.push(_uint[i]);
    }
    bool b = uintArray.contains(value);
    return b;
  }

  function containsAddress(
    address[] calldata _address,
    address value
  ) public returns (bool) {
    delete addressArray;
    for (uint i = 0; i < _address.length; i++) {
      addressArray.push(_address[i]);
    }
    bool b = addressArray.contains(value);
    return b;
  }

  function addUniqueUint(
    uint256[] calldata _uint,
    uint256 value
  ) public returns (uint256[] memory) {
    delete uintArray;
    for (uint i = 0; i < _uint.length; i++) {
      uintArray.push(_uint[i]);
    }
    uintArray.addUnique(value);
    return uintArray;
  }

  function addUniqueAddress(
    address[] calldata _address,
    address value
  ) public returns (address[] memory) {
    delete addressArray;
    for (uint i = 0; i < _address.length; i++) {
      addressArray.push(_address[i]);
    }
    addressArray.addUnique(value);
    return addressArray;
  }

  function addUniqueArrayUint(
    uint256[] calldata _uint,
    uint256[] memory value
  ) public returns (uint256[] memory) {
    delete uintArray;
    for (uint i = 0; i < _uint.length; i++) {
      uintArray.push(_uint[i]);
    }
    uintArray.addUniqueArray(value);
    return uintArray;
  }

  function addUniqueArrayAddress(
    address[] calldata _address,
    address[] memory value
  ) public returns (address[] memory){
    delete addressArray;
    for (uint i = 0; i < _address.length; i++) {
      addressArray.push(_address[i]);
    }
    addressArray.addUniqueArray(value);
    return addressArray;
  }

  function removeByIndexUint(
    uint256[] calldata _uint,
    uint256 value,
    bool _bool
  ) public returns (uint256[] memory) {
    delete uintArray;
    for (uint i = 0; i < _uint.length; i++) {
      uintArray.push(_uint[i]);
    }
    uintArray.removeByIndex(value, _bool);
    return uintArray;
  }

  function removeByIndexAddress(
    address[] calldata _address,
    uint256 value,
    bool _bool
  ) public returns (address[] memory) {
    delete addressArray;
    for (uint i = 0; i < _address.length; i++) {
      addressArray.push(_address[i]);
    }
    addressArray.removeByIndex(value, _bool);
    return addressArray;
  }

  function findAndRemoveUint(
    uint256[] calldata _uint,
    uint256 value,
    bool _bool
  ) public returns (uint256[] memory) {
    delete uintArray;
    for (uint i = 0; i < _uint.length; i++) {
      uintArray.push(_uint[i]);
    }
    uintArray.findAndRemove(value, _bool);
    return uintArray;
  }

  function findAndRemoveAddress(
    address[] calldata _address,
    address value,
    bool _bool
  ) public returns (address[] memory) {
    delete addressArray;
    for (uint i = 0; i < _address.length; i++) {
      addressArray.push(_address[i]);
    }
    addressArray.findAndRemove(value, _bool);
    return addressArray;
  }

  function findAndRemoveArrayUint(
    uint256[] calldata _uint,
    uint256[] memory value,
    bool _bool
  ) public returns (uint256[] memory) {
    delete uintArray;
    for (uint i = 0; i < _uint.length; i++) {
      uintArray.push(_uint[i]);
    }
    uintArray.findAndRemoveArray(value, _bool);
    return uintArray;
  }

  function findAndRemoveArrayAddress(
    address[] calldata _address,
    address[] memory value,
    bool _bool
  ) public returns (address[] memory) {
    delete addressArray;
    for (uint i = 0; i < _address.length; i++) {
      addressArray.push(_address[i]);
    }
    addressArray.findAndRemoveArray(value, _bool);
    return addressArray;
  }

  function sortAddressesByUint(
    address[] calldata _addresses,
    uint[] calldata _uints
  ) public returns (address[] memory) {
    delete addressArray;
    for (uint i = 0; i < _addresses.length; i++) {
      addressArray.push(_addresses[i]);
      uintMap[_addresses[i]] = _uints[i];
    }
    addressArray.sortAddressesByUint(uintMap);
    return addressArray;
  }

  function sortAddressesByUintReverted(
    address[] calldata _addresses,
    uint[] calldata _uints
  ) public returns (address[] memory) {
    delete addressArray;
    for (uint i = 0; i < _addresses.length; i++) {
      addressArray.push(_addresses[i]);
      uintMap[_addresses[i]] = _uints[i];
    }
    addressArray.sortAddressesByUintReverted(uintMap);
    return addressArray;
  }
}
