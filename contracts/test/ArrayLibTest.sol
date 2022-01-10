pragma solidity 0.8.4;
import "../base/ArrayLib.sol";

contract ArrayLibTest {
  uint256[] uintArray;
  address[] addressArray;

  using ArrayLib for address[];
  using ArrayLib for uint256[];

  function containsUint(uint256[] calldata _uint, uint256 value) public returns (bool) {
    delete uintArray;
    for (uint i=0; i<_uint.length; i++){
      uintArray.push(_uint[i]);
    }
    bool b = uintArray.contains(value);
    return b;
  }

  function containsAddress(address[] calldata _address, address value) public returns (bool) {
    delete addressArray;
    for (uint i=0; i<_address.length; i++){
      addressArray.push(_address[i]);
    }
    bool b = addressArray.contains(value);
    return b;
  }

  function addUniqueAddress(address[] calldata _address, address value) public returns(address[] memory) {
    delete addressArray;
    for (uint i=0; i<_address.length; i++){
    addressArray.push(_address[i]);
    }
    addressArray.addUnique(value);
    return addressArray;
  }

  function addUniqueUint(uint256[] calldata _uint, uint256 value) public returns(uint256[] memory){
    delete uintArray;
    for (uint i=0; i<_uint.length; i++){
      uintArray.push(_uint[i]);
    }
    uintArray.addUnique(value);
    return uintArray;
  }

  function addUniqueArrayAddress(address[] calldata _address, address[] memory value) public returns(address[] memory){
    delete addressArray;
    for (uint i=0; i<_address.length; i++){
      addressArray.push(_address[i]);
    }
   addressArray.addUniqueArray(value);
   return addressArray;
  }

  function addUniqueArrayUint(uint256[] calldata _uint, uint256[] memory value) public returns(uint256[] memory){
    delete uintArray;
    for (uint i=0; i<_uint.length; i++){
      uintArray.push(_uint[i]);
    }
    uintArray.addUniqueArray(value);
    return uintArray;
  }

  function removeByIndexAddress(address[] calldata _address, uint256 value) public returns(address[] memory){
    delete addressArray;
    for (uint i=0; i<_address.length; i++){
      addressArray.push(_address[i]);
    }
    addressArray.removeByIndex(value, true);
    return addressArray;
  }

  function removeByIndexUint(uint256[] calldata _uint, uint256 value) public returns(uint256[] memory){
    delete uintArray;
    for (uint i=0; i<_uint.length; i++){
      uintArray.push(_uint[i]);
    }
    uintArray.removeByIndex(value, true);
    return uintArray;
  }

  function findAndRemoveAddress(address[] calldata _address, address value) public returns(address[] memory){
    delete addressArray;
    for (uint i=0; i<_address.length; i++){
      addressArray.push(_address[i]);
    }
    addressArray.findAndRemove(value, true);
    return addressArray;
  }

  function findAndRemoveUint(uint256[] calldata _uint, uint256 value) public returns(uint256[] memory){
    delete uintArray;
    for (uint i=0; i<_uint.length; i++){
      uintArray.push(_uint[i]);
    }
    uintArray.findAndRemove(value, true);
    return uintArray;
  }

  function findAndRemoveArrayAddress(address[] calldata _address, address[] memory value) public returns(address[] memory){
    delete addressArray;
    for (uint i=0; i<_address.length; i++){
      addressArray.push(_address[i]);
    }
    addressArray.findAndRemoveArray(value, true);
    return addressArray;
  }

  function findAndRemoveArrayUint256(uint256[] calldata _uint, uint256[] memory value) public returns(uint256[] memory){
    delete uintArray;
    for (uint i=0; i<_uint.length; i++){
      uintArray.push(_uint[i]);
    }
    uintArray.findAndRemoveArray(value, true);
    return uintArray;
  }
}
