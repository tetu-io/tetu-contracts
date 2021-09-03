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

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interface/IStrategy.sol";
import "../interface/ISmartVault.sol";
import "../interface/IFeeRewardForwarder.sol";
import "./Controllable.sol";
import "../interface/IBookkeeper.sol";
import "../interface/IUpgradeSource.sol";
import "../interface/IFundKeeper.sol";
import "./ControllerStorage.sol";
import "../interface/ITetuProxy.sol";
import "../interface/IMintHelper.sol";
import "../interface/IAnnouncer.sol";

/// @title Contract for holding scheduling for time-lock actions
/// @dev Use with TetuProxy
/// @author belbix
contract Announcer is Controllable, IAnnouncer {

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.1.0";
  bytes32 internal constant _TIME_LOCK_SLOT = 0x244FE7C39AF244D294615908664E79A2F65DD3F4D5C387AF1D52197F465D1C2E;

  /// @dev Hold schedule for time-locked operations
  mapping(bytes32 => uint256) public override timeLockSchedule;
  /// @dev Hold values for upgrade
  TimeLockInfo[] private _timeLockInfos;
  /// @dev Hold indexes for upgrade info
  mapping(TimeLockOpCodes => uint256) public timeLockIndexes;
  /// @dev Hold indexes for upgrade info by address
  mapping(TimeLockOpCodes => mapping(address => uint256)) public multiTimeLockIndexes;
  /// @dev Deprecated, don't remove for keep slot ordering
  mapping(TimeLockOpCodes => bool) public multiOpCodes;

  /// @notice Address change was announced
  event AddressChangeAnnounce(TimeLockOpCodes opCode, address newAddress);
  /// @notice Uint256 change was announced
  event UintChangeAnnounce(TimeLockOpCodes opCode, uint256 newValue);
  /// @notice Ratio change was announced
  event RatioChangeAnnounced(TimeLockOpCodes opCode, uint256 numerator, uint256 denominator);
  /// @notice Token movement was announced
  event TokenMoveAnnounced(TimeLockOpCodes opCode, address target, address token, uint256 amount);
  /// @notice Proxy Upgrade was announced
  event ProxyUpgradeAnnounced(address _contract, address _implementation);
  /// @notice Mint was announced
  event MintAnnounced(uint256 totalAmount, address _distributor, address _otherNetworkFund);
  /// @notice Announce was closed
  event AnnounceClosed(bytes32 opHash);
  /// @notice Strategy Upgrade was announced
  event StrategyUpgradeAnnounced(address _contract, address _implementation);
  /// @notice Vault stop action announced
  event VaultStop(address _contract);

  constructor() {
    require(_TIME_LOCK_SLOT == bytes32(uint256(keccak256("eip1967.announcer.timeLock")) - 1), "wrong timeLock");
  }

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _controller Controller address
  /// @param _timeLock TimeLock period
  function initialize(address _controller, uint256 _timeLock) external initializer {
    Controllable.initializeControllable(_controller);

    // fill timeLock
    bytes32 slot = _TIME_LOCK_SLOT;
    assembly {
      sstore(slot, _timeLock)
    }

    // placeholder for index 0
    _timeLockInfos.push(TimeLockInfo(TimeLockOpCodes.ZeroPlaceholder, 0, address(0), new address[](0), new uint256[](0)));
  }

  /// @dev Operations allowed only for Governance address
  modifier onlyGovernance() {
    require(isGovernance(msg.sender), "not governance");
    _;
  }

  /// @dev Operations allowed for Governance or Dao addresses
  modifier onlyGovernanceOrDao() {
    require(isGovernance(msg.sender)
      || IController(controller()).isDao(msg.sender), "not governance or dao");
    _;
  }

  /// @dev Operations allowed for Governance or Dao addresses
  modifier onlyControlMembers() {
    require(
      isGovernance(msg.sender)
      || isController(msg.sender)
      || IController(controller()).isDao(msg.sender)
      || IController(controller()).vaultController() == msg.sender
    , "not control member");
    _;
  }

  // ************** VIEW ********************

  /// @notice Return time-lock period (in seconds) saved in the contract slot
  /// @return result TimeLock period
  function timeLock() public view returns (uint256 result) {
    bytes32 slot = _TIME_LOCK_SLOT;
    assembly {
      result := sload(slot)
    }
  }

  /// @notice Length of the the array of all undone announced actions
  /// @return Array length
  function timeLockInfosLength() external view returns (uint256) {
    return _timeLockInfos.length;
  }

  /// @notice Return information about announced time-locks for given index
  /// @param idx Index of time lock info
  /// @return TimeLock information
  function timeLockInfo(uint256 idx) external override view returns (TimeLockInfo memory) {
    return _timeLockInfos[idx];
  }

  // ************** ANNOUNCES **************

  /// @notice Only Governance can do it.
  ///         Announce address change. You will able to setup new address after Time-lock period
  /// @param opCode Operation code from the list
  ///                 0 - Governance
  ///                 1 - Dao
  ///                 2 - FeeRewardForwarder
  ///                 3 - Bookkeeper
  ///                 4 - MintHelper
  ///                 5 - RewardToken
  ///                 6 - FundToken
  ///                 7 - PsVault
  ///                 8 - Fund
  ///                 19 - VaultController
  /// @param newAddress New address
  function announceAddressChange(TimeLockOpCodes opCode, address newAddress) external onlyGovernance {
    require(timeLockIndexes[opCode] == 0, "already announced");
    require(newAddress != address(0), "zero address");
    bytes32 opHash = keccak256(abi.encode(opCode, newAddress));
    timeLockSchedule[opHash] = block.timestamp + timeLock();

    address[] memory values = new address[](1);
    values[0] = newAddress;
    _timeLockInfos.push(TimeLockInfo(opCode, opHash, controller(), values, new uint256[](0)));
    timeLockIndexes[opCode] = (_timeLockInfos.length - 1);

    emit AddressChangeAnnounce(opCode, newAddress);
  }

  /// @notice Only Governance can do it.
  ///         Announce some single uint256 change. You will able to setup new value after Time-lock period
  /// @param opCode Operation code from the list
  ///                 20 - RewardBoostDuration
  ///                 21 - RewardRatioWithoutBoost
  /// @param newValue New value
  function announceUintChange(TimeLockOpCodes opCode, uint256 newValue) external onlyGovernance {
    require(timeLockIndexes[opCode] == 0, "already announced");
    bytes32 opHash = keccak256(abi.encode(opCode, newValue));
    timeLockSchedule[opHash] = block.timestamp + timeLock();

    uint256[] memory values = new uint256[](1);
    values[0] = newValue;
    _timeLockInfos.push(TimeLockInfo(opCode, opHash, address(0), new address[](0), values));
    timeLockIndexes[opCode] = (_timeLockInfos.length - 1);

    emit UintChangeAnnounce(opCode, newValue);
  }

  /// @notice Only Governance or DAO can do it.
  ///         Announce ratio change. You will able to setup new ratio after Time-lock period
  /// @param opCode Operation code from the list
  ///                 9 - PsRatio
  ///                 10 - FundRatio
  /// @param numerator New numerator
  /// @param denominator New denominator
  function announceRatioChange(TimeLockOpCodes opCode, uint256 numerator, uint256 denominator) external override onlyGovernanceOrDao {
    require(timeLockIndexes[opCode] == 0, "already announced");
    require(numerator <= denominator, "invalid values");
    require(denominator != 0, "cannot divide by 0");
    bytes32 opHash = keccak256(abi.encode(opCode, numerator, denominator));
    timeLockSchedule[opHash] = block.timestamp + timeLock();

    uint256[] memory values = new uint256[](2);
    values[0] = numerator;
    values[1] = denominator;
    _timeLockInfos.push(TimeLockInfo(opCode, opHash, controller(), new address[](0), values));
    timeLockIndexes[opCode] = (_timeLockInfos.length - 1);

    emit RatioChangeAnnounced(opCode, numerator, denominator);
  }

  /// @notice Only Governance can do it. Announce token movement. You will able to transfer after Time-lock period
  /// @param opCode Operation code from the list
  ///                 11 - ControllerTokenMove
  ///                 12 - StrategyTokenMove
  ///                 13 - FundTokenMove
  /// @param target Target address
  /// @param token Token that you want to move
  /// @param amount Amount that you want to move
  function announceTokenMove(TimeLockOpCodes opCode, address target, address token, uint256 amount)
  external onlyGovernance {
    require(timeLockIndexes[opCode] == 0, "already announced");
    require(target != address(0), "zero target");
    require(token != address(0), "zero token");
    require(amount != 0, "zero amount");
    bytes32 opHash = keccak256(abi.encode(opCode, target, token, amount));
    timeLockSchedule[opHash] = block.timestamp + timeLock();

    address[] memory adrValues = new address[](1);
    adrValues[0] = token;
    uint256[] memory intValues = new uint256[](1);
    intValues[0] = amount;
    _timeLockInfos.push(TimeLockInfo(opCode, opHash, target, adrValues, intValues));
    timeLockIndexes[opCode] = (_timeLockInfos.length - 1);

    emit TokenMoveAnnounced(opCode, target, token, amount);
  }

  /// @notice Only Governance can do it. Announce weekly mint. You will able to mint after Time-lock period
  /// @param totalAmount Total amount to mint.
  ///                    33% will go to current network, 67% to FundKeeper for other networks
  /// @param _distributor Distributor address, usually NotifyHelper
  /// @param _otherNetworkFund Fund address, usually FundKeeper
  function announceMint(
    uint256 totalAmount,
    address _distributor,
    address _otherNetworkFund,
    bool mintAllAvailable
  ) external onlyGovernance {
    TimeLockOpCodes opCode = TimeLockOpCodes.Mint;

    require(timeLockIndexes[opCode] == 0, "already announced");
    require(totalAmount != 0 || mintAllAvailable, "zero amount");
    require(_distributor != address(0), "zero distributor");
    require(_otherNetworkFund != address(0), "zero fund");

    bytes32 opHash = keccak256(abi.encode(opCode, totalAmount, _distributor, _otherNetworkFund, mintAllAvailable));
    timeLockSchedule[opHash] = block.timestamp + timeLock();

    address[] memory adrValues = new address[](2);
    adrValues[0] = _distributor;
    adrValues[1] = _otherNetworkFund;
    uint256[] memory intValues = new uint256[](1);
    intValues[0] = totalAmount;

    address mintHelper = IController(controller()).mintHelper();

    _timeLockInfos.push(TimeLockInfo(opCode, opHash, mintHelper, adrValues, intValues));
    timeLockIndexes[opCode] = _timeLockInfos.length - 1;

    emit MintAnnounced(totalAmount, _distributor, _otherNetworkFund);
  }

  /// @notice Only Governance can do it. Announce Batch Proxy upgrade
  /// @param _contracts Array of Proxy contract addresses for upgrade
  /// @param _implementations Array of New implementation addresses
  function announceTetuProxyUpgradeBatch(address[] calldata _contracts, address[] calldata _implementations)
  external onlyGovernance {
    require(_contracts.length == _implementations.length, "wrong arrays");
    for (uint256 i = 0; i < _contracts.length; i++) {
      announceTetuProxyUpgrade(_contracts[i], _implementations[i]);
    }
  }

  /// @notice Only Governance can do it. Announce Proxy upgrade. You will able to mint after Time-lock period
  /// @param _contract Proxy contract address for upgrade
  /// @param _implementation New implementation address
  function announceTetuProxyUpgrade(address _contract, address _implementation) public onlyGovernance {
    TimeLockOpCodes opCode = TimeLockOpCodes.TetuProxyUpdate;

    require(multiTimeLockIndexes[opCode][_contract] == 0, "already announced");
    require(_contract != address(0), "zero contract");
    require(_implementation != address(0), "zero implementation");

    bytes32 opHash = keccak256(abi.encode(opCode, _contract, _implementation));
    timeLockSchedule[opHash] = block.timestamp + timeLock();

    address[] memory values = new address[](1);
    values[0] = _implementation;
    _timeLockInfos.push(TimeLockInfo(opCode, opHash, _contract, values, new uint256[](0)));
    multiTimeLockIndexes[opCode][_contract] = (_timeLockInfos.length - 1);

    emit ProxyUpgradeAnnounced(_contract, _implementation);
  }

  /// @notice Only Governance can do it. Announce strategy update for given vaults
  /// @param _targets Vault addresses
  /// @param _strategies Strategy addresses
  function announceStrategyUpgrades(address[] calldata _targets, address[] calldata _strategies) external onlyGovernance {
    TimeLockOpCodes opCode = TimeLockOpCodes.StrategyUpgrade;
    require(_targets.length == _strategies.length, "wrong arrays");
    for (uint256 i = 0; i < _targets.length; i++) {
      require(multiTimeLockIndexes[opCode][_targets[i]] == 0, "already announced");
      bytes32 opHash = keccak256(abi.encode(opCode, _targets[i], _strategies[i]));
      timeLockSchedule[opHash] = block.timestamp + timeLock();

      address[] memory values = new address[](1);
      values[0] = _strategies[i];
      _timeLockInfos.push(TimeLockInfo(opCode, opHash, _targets[i], values, new uint256[](0)));
      multiTimeLockIndexes[opCode][_targets[i]] = (_timeLockInfos.length - 1);

      emit StrategyUpgradeAnnounced(_targets[i], _strategies[i]);
    }
  }

  /// @notice Only Governance can do it. Announce the stop vault action
  /// @param _vaults Vault addresses
  function announceVaultStopBatch(address[] calldata _vaults) external onlyGovernance {
    TimeLockOpCodes opCode = TimeLockOpCodes.VaultStop;
    for (uint256 i = 0; i < _vaults.length; i++) {
      require(multiTimeLockIndexes[opCode][_vaults[i]] == 0, "already announced");
      bytes32 opHash = keccak256(abi.encode(opCode, _vaults[i]));
      timeLockSchedule[opHash] = block.timestamp + timeLock();

      _timeLockInfos.push(TimeLockInfo(opCode, opHash, _vaults[i], new address[](0), new uint256[](0)));
      multiTimeLockIndexes[opCode][_vaults[i]] = (_timeLockInfos.length - 1);

      emit VaultStop(_vaults[i]);
    }
  }

  /// @notice Close any announce. Use in emergency case.
  /// @param opCode TimeLockOpCodes uint8 value
  /// @param opHash keccak256(abi.encode()) code with attributes.
  /// @param target Address for multi time lock. Set zero address if not required.
  function closeAnnounce(TimeLockOpCodes opCode, bytes32 opHash, address target) external onlyGovernance {
    clearAnnounce(opHash, opCode, target);
    emit AnnounceClosed(opHash);
  }

  /// @notice Only controller can use it. Clear announce after successful call time-locked function
  /// @param opHash Generated keccak256 opHash
  /// @param opCode TimeLockOpCodes uint8 value
  function clearAnnounce(bytes32 opHash, TimeLockOpCodes opCode, address target) public override onlyControlMembers {
    timeLockSchedule[opHash] = 0;
    if (multiTimeLockIndexes[opCode][target] != 0) {
      multiTimeLockIndexes[opCode][target] = 0;
    } else {
      timeLockIndexes[opCode] = 0;
    }
  }

}
