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

import "../../openzeppelin/Initializable.sol";
import "../interfaces/IFeeRewardForwarder.sol";

/// @title Eternal storage + getters and setters pattern
/// @dev If you will change a key value it will require setup it again
/// @author belbix
abstract contract ForwarderV2Storage is Initializable, IFeeRewardForwarder {

  struct LpData {
    address lp;
    address token;
    address oppositeToken;
  }

  struct UniFee {
    uint numerator;
    uint denominator;
  }

  // ************ VARIABLES **********************
  // don't change names or ordering!
  mapping(bytes32 => uint256) private uintStorage;
  mapping(bytes32 => address) private addressStorage;

  /// @dev DEPRECATED Liquidity Pools with the highest TVL for given token
  mapping(address => LpData) public largestLps;
  /// @dev DEPRECATED Liquidity Pools with the most popular tokens
  mapping(address => mapping(address => LpData)) public blueChipsLps;
  /// @dev DEPRECATED Factory address to fee value map
  mapping(address => UniFee) public uniPlatformFee;
  /// @dev DEPRECATED Hold blue chips tokens addresses
  mapping(address => bool) public blueChipsTokens;
  /// @dev Token liquidation threshold in USD value
  mapping(address => uint) public tokenThreshold;
  /// @dev TetuLiquidator address
  address public liquidator;

  // ************ EVENTS **********************

  /// @notice Address changed the variable with `name`
  event UpdatedAddressSlot(string indexed name, address oldValue, address newValue);
  /// @notice Value changed the variable with `name`
  event UpdatedUint256Slot(string indexed name, uint256 oldValue, uint256 newValue);

  // ******************* SETTERS AND GETTERS **********************

  function _setLiquidityRouter(address _address) internal {
    emit UpdatedAddressSlot("liquidityRouter", liquidityRouter(), _address);
    setAddress("liquidityRouter", _address);
  }

  /// @notice Router address for adding liquidity
  function liquidityRouter() public view override returns (address) {
    return getAddress("liquidityRouter");
  }

  function _setVeDist(address _address) internal {
    emit UpdatedAddressSlot("veDist", veDist(), _address);
    setAddress("veDist", _address);
  }

  /// @notice veTETU distributor contract
  function veDist() public view returns (address) {
    return getAddress("veDist");
  }

  function _setLiquidityNumerator(uint256 _value) internal {
    emit UpdatedUint256Slot("liquidityNumerator", liquidityNumerator(), _value);
    setUint256("liquidityNumerator", _value);
  }

  /// @notice Numerator for part of profit that goes to TETU liquidity
  function liquidityNumerator() public view override returns (uint256) {
    return getUint256("liquidityNumerator");
  }

  function _setSlippageNumerator(uint256 _value) internal {
    emit UpdatedUint256Slot("slippageNumerator", _slippageNumerator(), _value);
    setUint256("slippageNumerator", _value);
  }

  /// @notice Numerator for part of profit that goes to TETU liquidity
  function _slippageNumerator() internal view returns (uint256) {
    return getUint256("slippageNumerator");
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
  uint256[48] private ______gap;
}
