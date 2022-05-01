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


/// @title Eternal storage + getters and setters pattern
/// @dev If you will change a key value it will require setup it again
/// @author belbix
abstract contract AutoRewarderStorage is Initializable {

  struct RewardInfo {
    address vault;
    uint256 time;
    uint256 strategyRewardsUsd;
  }

  // don't change names or ordering!
  mapping(bytes32 => uint256) private uintStorage;
  mapping(bytes32 => address) private addressStorage;

  // *********** VARIABLES ****************

  /// @dev Reward info for vaults
  mapping(address => RewardInfo) public lastInfo;
  /// @dev List of registered vaults. Can contains inactive
  address[] public vaults;
  /// @dev Last distribution time for vault. We can not distribute more often than PERIOD
  mapping(address => uint256) public lastDistributionTs;
  /// @dev Last distributed amount for vaults
  mapping(address => uint256) public lastDistributedAmount;
  /// @dev Skip distribution for vaults with this strategy platform id
  mapping(uint256 => bool) public excludedPlatforms;

  /// @notice Address changed the variable with `name`
  event UpdatedAddressSlot(string indexed name, address oldValue, address newValue);
  /// @notice Value changed the variable with `name`
  event UpdatedUint256Slot(string indexed name, uint256 oldValue, uint256 newValue);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  function initializeAutoRewarderStorage(
    address _rewardCalculator,
    uint _networkRatio,
    uint _rewardPerDay,
    uint _period
  ) public initializer {
    _setRewardCalculator(_rewardCalculator);
    _setNetworkRatio(_networkRatio);
    _setRewardsPerDay(_rewardPerDay);
    _setPeriod(_period);
  }

  // ******************* SETTERS AND GETTERS **********************

  function _setNetworkRatio(uint256 _value) internal {
    emit UpdatedUint256Slot("networkRatio", networkRatio(), _value);
    setUint256("networkRatio", _value);
  }

  /// @dev Emission ratio for current distributor contract
  function networkRatio() public view returns (uint256) {
    return getUint256("networkRatio");
  }

  function _setRewardCalculator(address _address) internal {
    emit UpdatedAddressSlot("rewardCalculator", rewardCalculator(), _address);
    setAddress("rewardCalculator", _address);
  }

  function rewardCalculator() public view returns (address) {
    return getAddress("rewardCalculator");
  }

  function _setRewardsPerDay(uint256 _value) internal {
    emit UpdatedUint256Slot("rewardsPerDay", rewardsPerDay(), _value);
    setUint256("rewardsPerDay", _value);
  }

  /// @dev Capacity for daily distribution. Gov set it manually
  function rewardsPerDay() public view returns (uint256) {
    return getUint256("rewardsPerDay");
  }

  function _setPeriod(uint256 _value) internal {
    emit UpdatedUint256Slot("period", period(), _value);
    setUint256("period", _value);
  }

  /// @dev Rewards period
  function period() public view returns (uint256) {
    return getUint256("period");
  }

  function _setTotalStrategyRewards(uint256 _value) internal {
    emit UpdatedUint256Slot("totalStrategyRewards", totalStrategyRewards(), _value);
    setUint256("totalStrategyRewards", _value);
  }

  /// @dev Actual sum of all strategy rewards
  function totalStrategyRewards() public view returns (uint256) {
    return getUint256("totalStrategyRewards");
  }

  function _setLastDistributedId(uint256 _value) internal {
    emit UpdatedUint256Slot("lastDistributedId", lastDistributedId(), _value);
    setUint256("lastDistributedId", _value);
  }

  /// @dev Vault list counter for ordered distribution. Refresh when cycle ended
  function lastDistributedId() public view returns (uint256) {
    return getUint256("lastDistributedId");
  }

  function _setDistributed(uint256 _value) internal {
    emit UpdatedUint256Slot("distributed", distributed(), _value);
    setUint256("distributed", _value);
  }

  /// @dev Distributed amount for avoiding over spending during period
  function distributed() public view returns (uint256) {
    return getUint256("distributed");
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
  uint256[49] private ______gap;
}
