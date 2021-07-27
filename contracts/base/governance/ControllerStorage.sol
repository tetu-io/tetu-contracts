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
import "../interface/IController.sol";

/// @title Eternal storage + getters and setters pattern
/// @dev If you will change a key value it will require setup it again
/// @author belbix
abstract contract ControllerStorage is Initializable, IController {

  // don't change names or ordering!
  mapping(bytes32 => uint256) private uintStorage;
  mapping(bytes32 => address) private addressStorage;

  /// @notice Address changed the variable with `name`
  event UpdatedAddressSlot(string indexed name, address oldValue, address newValue);
  /// @notice Value changed the variable with `name`
  event UpdatedUint256Slot(string indexed name, uint256 oldValue, uint256 newValue);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _governance Governance address
  function initializeControllerStorage(
    address _governance
  ) public initializer {
    _setGovernance(_governance);
  }

  // ******************* SETTERS AND GETTERS **********************

  // ----------- ADDRESSES ----------
  function _setGovernance(address _address) internal {
    emit UpdatedAddressSlot("governance", governance(), _address);
    setAddress("governance", _address);
  }

  /// @notice Return governance address
  /// @return Governance address
  function governance() public override view returns (address) {
    return getAddress("governance");
  }

  function _setDao(address _address) internal {
    emit UpdatedAddressSlot("dao", dao(), _address);
    setAddress("dao", _address);
  }

  /// @notice Return DAO address
  /// @return DAO address
  function dao() public override view returns (address) {
    return getAddress("dao");
  }

  function _setFeeRewardForwarder(address _address) internal {
    emit UpdatedAddressSlot("feeRewardForwarder", feeRewardForwarder(), _address);
    setAddress("feeRewardForwarder", _address);
  }

  /// @notice Return FeeRewardForwarder address
  /// @return FeeRewardForwarder address
  function feeRewardForwarder() public override view returns (address) {
    return getAddress("feeRewardForwarder");
  }

  function _setBookkeeper(address _address) internal {
    emit UpdatedAddressSlot("bookkeeper", bookkeeper(), _address);
    setAddress("bookkeeper", _address);
  }

  /// @notice Return Bookkeeper address
  /// @return Bookkeeper address
  function bookkeeper() public override view returns (address) {
    return getAddress("bookkeeper");
  }

  function _setMintHelper(address _address) internal {
    emit UpdatedAddressSlot("mintHelper", mintHelper(), _address);
    setAddress("mintHelper", _address);
  }

  /// @notice Return MintHelper address
  /// @return MintHelper address
  function mintHelper() public override view returns (address) {
    return getAddress("mintHelper");
  }

  function _setRewardToken(address _address) internal {
    emit UpdatedAddressSlot("rewardToken", rewardToken(), _address);
    setAddress("rewardToken", _address);
  }

  /// @notice Return TETU address
  /// @return TETU address
  function rewardToken() public override view returns (address) {
    return getAddress("rewardToken");
  }

  function _setFundToken(address _address) internal {
    emit UpdatedAddressSlot("fundToken", fundToken(), _address);
    setAddress("fundToken", _address);
  }

  /// @notice Return a token address used for FundKeeper
  /// @return FundKeeper's main token address
  function fundToken() public override view returns (address) {
    return getAddress("fundToken");
  }

  function _setPsVault(address _address) internal {
    emit UpdatedAddressSlot("psVault", psVault(), _address);
    setAddress("psVault", _address);
  }

  /// @notice Return Profit Sharing pool address
  /// @return Profit Sharing pool address
  function psVault() public override view returns (address) {
    return getAddress("psVault");
  }

  function _setFund(address _address) internal {
    emit UpdatedAddressSlot("fund", fund(), _address);
    setAddress("fund", _address);
  }

  /// @notice Return FundKeeper address
  /// @return FundKeeper address
  function fund() public override view returns (address) {
    return getAddress("fund");
  }

  function _setAnnouncer(address _address) internal {
    emit UpdatedAddressSlot("announcer", announcer(), _address);
    setAddress("announcer", _address);
  }

  /// @notice Return Announcer address
  /// @return Announcer address
  function announcer() public override view returns (address) {
    return getAddress("announcer");
  }

  // ----------- INTEGERS ----------
  function _setPsNumerator(uint256 _value) internal {
    emit UpdatedUint256Slot("psNumerator", psNumerator(), _value);
    setUint256("psNumerator", _value);
  }

  /// @notice Return Profit Sharing pool ratio's numerator
  /// @return Profit Sharing pool ratio numerator
  function psNumerator() public view override returns (uint256) {
    return getUint256("psNumerator");
  }

  function _setPsDenominator(uint256 _value) internal {
    emit UpdatedUint256Slot("psDenominator", psDenominator(), _value);
    setUint256("psDenominator", _value);
  }

  /// @notice Return Profit Sharing pool ratio's denominator
  /// @return Profit Sharing pool ratio denominator
  function psDenominator() public view override returns (uint256) {
    return getUint256("psDenominator");
  }

  function _setFundNumerator(uint256 _value) internal {
    emit UpdatedUint256Slot("fundNumerator", fundNumerator(), _value);
    setUint256("fundNumerator", _value);
  }

  /// @notice Return FundKeeper ratio's numerator
  /// @return FundKeeper ratio numerator
  function fundNumerator() public view override returns (uint256) {
    return getUint256("fundNumerator");
  }

  function _setFundDenominator(uint256 _value) internal {
    emit UpdatedUint256Slot("fundDenominator", fundDenominator(), _value);
    setUint256("fundDenominator", _value);
  }

  /// @notice Return FundKeeper ratio's denominator
  /// @return FundKeeper ratio denominator
  function fundDenominator() public view override returns (uint256) {
    return getUint256("fundDenominator");
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
