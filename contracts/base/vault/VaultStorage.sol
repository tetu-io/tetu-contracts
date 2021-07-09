//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "../interface/ISmartVault.sol";

// Eternal storage + getters and setters pattern
// If you will change a key value it will require setup it again
// Implements IVault interface for reducing code base
abstract contract VaultStorage is Initializable, ISmartVault {

  // don't change names or ordering!
  mapping(bytes32 => uint256) private uintStorage;
  mapping(bytes32 => address) private addressStorage;
  mapping(bytes32 => bool) private boolStorage;

  event UpdatedBoolSlot(string name, bool oldValue, bool newValue);
  event UpdatedAddressSlot(string name, address oldValue, address newValue);
  event UpdatedUint256Slot(string name, uint256 oldValue, uint256 newValue);

  function initializeVaultStorage(
    address _underlyingToken,
    uint256 _durationValue
  ) public initializer {
    _setUnderlying(_underlyingToken);
    _setStrategyUpdateTime(0);
    _setFutureStrategy(address(0));
    _setDuration(_durationValue);
    _setActive(true);
  }

  // ******************* SETTERS AND GETTERS **********************

  function _setStrategy(address _address) internal {
    emit UpdatedAddressSlot("strategy", strategy(), _address);
    setAddress("strategy", _address);
  }

  function strategy() public override view returns (address) {
    return getAddress("strategy");
  }

  function _setUnderlying(address _address) private {
    emit UpdatedAddressSlot("underlying", strategy(), _address);
    setAddress("underlying", _address);
  }

  function underlying() public view override returns (address) {
    return getAddress("underlying");
  }

  function _setNextImplementation(address _address) internal {
    emit UpdatedAddressSlot("nextImplementation", nextImplementation(), _address);
    setAddress("nextImplementation", _address);
  }

  function nextImplementation() public view override returns (address) {
    return getAddress("nextImplementation");
  }

  function _setNextImplementationTimestamp(uint256 _value) internal {
    emit UpdatedUint256Slot("nextImplementationTimestamp", nextImplementationTimestamp(), _value);
    setUint256("nextImplementationTimestamp", _value);
  }

  function nextImplementationTimestamp() public view override returns (uint256) {
    return getUint256("nextImplementationTimestamp");
  }

  function _setFutureStrategy(address _value) internal {
    emit UpdatedAddressSlot("futureStrategy", futureStrategy(), _value);
    setAddress("futureStrategy", _value);
  }

  function futureStrategy() public view override returns (address) {
    return getAddress("futureStrategy");
  }

  function _setStrategyUpdateTime(uint256 _value) internal {
    emit UpdatedUint256Slot("strategyUpdateTime", strategyUpdateTime(), _value);
    setUint256("strategyUpdateTime", _value);
  }

  function strategyUpdateTime() public view override returns (uint256) {
    return getUint256("strategyUpdateTime");
  }

  function _setDuration(uint256 _value) internal {
    emit UpdatedUint256Slot("duration", duration(), _value);
    setUint256("duration", _value);
  }

  function duration() public view override returns (uint256) {
    return getUint256("duration");
  }

  function _setActive(bool _value) internal {
    emit UpdatedBoolSlot("active", active(), _value);
    setBoolean("active", _value);
  }

  function active() public view override returns (bool) {
    return getBoolean("active");
  }

  // ******************** STORAGE INTERNAL FUNCTIONS ********************

  function setBoolean(string memory key, bool _value) internal {
    boolStorage[keccak256(abi.encodePacked(key))] = _value;
  }

  function getBoolean(string memory key) internal view returns (bool) {
    return boolStorage[keccak256(abi.encodePacked(key))];
  }

  function setAddress(string memory key, address _address) private {
    addressStorage[keccak256(abi.encodePacked(key))] = _address;
  }

  function getAddress(string memory key) private view returns (address) {
    return addressStorage[keccak256(abi.encodePacked(key))];
  }

  function setUint256(string memory key, uint256 _value) private {
    uintStorage[keccak256(abi.encodePacked(key))] = _value;
  }

  function getUint256(string memory key) private view returns (uint256) {
    return uintStorage[keccak256(abi.encodePacked(key))];
  }

  uint256[50] private ______gap;
}
