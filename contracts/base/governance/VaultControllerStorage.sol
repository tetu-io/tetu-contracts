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

import "../interfaces/IVaultController.sol";
import "../../openzeppelin/Initializable.sol";

/// @title Eternal storage + getters and setters pattern
/// @dev If you will change a key value it will require setup it again
/// @author belbix
abstract contract VaultControllerStorage is Initializable, IVaultController {

  // don't change names or ordering!
  mapping(bytes32 => uint256) private uintStorage;
  mapping(bytes32 => address) private addressStorage;

  /// @notice Address changed the variable with `name`
  event UpdatedAddressSlot(string indexed name, address oldValue, address newValue);
  /// @notice Value changed the variable with `name`
  event UpdatedUint256Slot(string indexed name, uint256 oldValue, uint256 newValue);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  function initializeVaultControllerStorage() public initializer {
    _setRewardBoostDuration(4 weeks);
    _setRewardRatioWithoutBoost(30);
  }

  // ******************* SETTERS AND GETTERS **********************

  function _setRewardBoostDuration(uint256 _value) internal {
    emit UpdatedUint256Slot("rewardBoostDuration", rewardBoostDuration(), _value);
    setUint256("rewardBoostDuration", _value);
  }

  /// @notice Return vault reward boost duration
  function rewardBoostDuration() public view override returns (uint256) {
    return getUint256("rewardBoostDuration");
  }

  function _setRewardRatioWithoutBoost(uint256 _value) internal {
    emit UpdatedUint256Slot("rewardRatioWithoutBoost", rewardRatioWithoutBoost(), _value);
    setUint256("rewardRatioWithoutBoost", _value);
  }

  /// @notice Return vault reward base ration without any boost
  function rewardRatioWithoutBoost() public view override returns (uint256) {
    return getUint256("rewardRatioWithoutBoost");
  }

  // ******************** STORAGE INTERNAL FUNCTIONS ********************

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
