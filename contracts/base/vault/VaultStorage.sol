// SPDX-License-Identifier: ISC
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/

pragma solidity 0.8.4;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interface/ISmartVault.sol";

/// @title Eternal storage + getters and setters pattern
/// @dev If you will change a key value it will require setup it again
///      Implements IVault interface for reducing code base
/// @author belbix
abstract contract VaultStorage is Initializable, ISmartVault {

  // don't change names or ordering!
  mapping(bytes32 => uint256) private uintStorage;
  mapping(bytes32 => address) private addressStorage;
  mapping(bytes32 => bool) private boolStorage;

  /// @notice Boolean value changed the variable with `name`
  event UpdatedBoolSlot(string indexed name, bool oldValue, bool newValue);
  /// @notice Address changed the variable with `name`
  event UpdatedAddressSlot(string indexed name, address oldValue, address newValue);
  /// @notice Value changed the variable with `name`
  event UpdatedUint256Slot(string indexed name, uint256 oldValue, uint256 newValue);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _underlyingToken Vault underlying token
  /// @param _durationValue Reward vesting period
  function initializeVaultStorage(
    address _underlyingToken,
    uint256 _durationValue,
    bool _lockAllowed
  ) public initializer {
    _setUnderlying(_underlyingToken);
    _setDuration(_durationValue);
    _setActive(true);
    // no way to change it after initialisation for avoiding risks of misleading users
    setBoolean("lockAllowed", _lockAllowed);
  }

  // ******************* SETTERS AND GETTERS **********************

  function _setStrategy(address _address) internal {
    emit UpdatedAddressSlot("strategy", strategy(), _address);
    setAddress("strategy", _address);
  }

  /// @notice Current strategy that vault use for farming
  function strategy() public override view returns (address) {
    return getAddress("strategy");
  }

  function _setUnderlying(address _address) private {
    emit UpdatedAddressSlot("underlying", strategy(), _address);
    setAddress("underlying", _address);
  }

  /// @notice Vault underlying
  function underlying() public view override returns (address) {
    return getAddress("underlying");
  }

  function _setDuration(uint256 _value) internal {
    emit UpdatedUint256Slot("duration", duration(), _value);
    setUint256("duration", _value);
  }

  /// @notice Rewards vesting period
  function duration() public view override returns (uint256) {
    return getUint256("duration");
  }

  function _setActive(bool _value) internal {
    emit UpdatedBoolSlot("active", active(), _value);
    setBoolean("active", _value);
  }

  /// @notice Vault status
  function active() public view override returns (bool) {
    return getBoolean("active");
  }

  function _setPpfsDecreaseAllowed(bool _value) internal {
    emit UpdatedBoolSlot("ppfsDecreaseAllowed", ppfsDecreaseAllowed(), _value);
    setBoolean("ppfsDecreaseAllowed", _value);
  }

  /// @notice Vault status
  function ppfsDecreaseAllowed() public view override returns (bool) {
    return getBoolean("ppfsDecreaseAllowed");
  }

  function _setLockPeriod(uint256 _value) internal {
    emit UpdatedUint256Slot("lockPeriod", lockPeriod(), _value);
    setUint256("lockPeriod", _value);
  }

  /// @notice Deposit lock period
  function lockPeriod() public view override returns (uint256) {
    return getUint256("lockPeriod");
  }

  function _setLockPenalty(uint256 _value) internal {
    emit UpdatedUint256Slot("lockPenalty", lockPenalty(), _value);
    setUint256("lockPenalty", _value);
  }

  /// @notice Base penalty if funds locked
  function lockPenalty() public view override returns (uint256) {
    return getUint256("lockPenalty");
  }

  function _disableLock() internal {
    emit UpdatedBoolSlot("lockAllowed", lockAllowed(), false);
    setBoolean("lockAllowed", false);
  }

  /// @notice Lock functionality allowed for this contract or not
  function lockAllowed() public view override returns (bool) {
    return getBoolean("lockAllowed");
  }

  // ******************** STORAGE INTERNAL FUNCTIONS ********************

  function setBoolean(string memory key, bool _value) private {
    boolStorage[keccak256(abi.encodePacked(key))] = _value;
  }

  function getBoolean(string memory key) private view returns (bool) {
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

  //slither-disable-next-line unused-state
  uint256[50] private ______gap;
}
