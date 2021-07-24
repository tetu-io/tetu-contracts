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
  string public constant VERSION = "1.0.0";
  uint256 public constant TIME_LOCK = 48 hours;

  /// @dev Hold schedule for time-locked operations
  mapping(bytes32 => uint256) public override timeLockSchedule;
  /// @dev Hold values for upgrade
  TimeLockInfo[] public timeLockInfos;
  /// @dev Hold indexes for upgrade info
  mapping(TimeLockOpCodes => uint256) public timeLockIndexes;
  /// @dev Hold indexes for upgrade info by address
  mapping(TimeLockOpCodes => mapping(address => uint256)) public multiTimeLockIndexes;
  /// @dev A list of opCodes allowed for multi scheduling
  mapping(TimeLockOpCodes => bool) public multiOpCodes;

  /// @notice Address change was announced
  event AddressChangeAnnounce(TimeLockOpCodes opCode, address newAddress);
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

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _controller Controller address
  function initialize(address _controller) external initializer {
    Controllable.initializeControllable(_controller);
    // setup multi opCodes
    multiOpCodes[TimeLockOpCodes.TetuProxyUpdate] = true;
    multiOpCodes[TimeLockOpCodes.StrategyUpgrade] = true;
  }

  /// @dev Operations allowed only for Governance address
  modifier onlyGovernance() {
    require(IController(controller()).isGovernance(msg.sender), "not governance");
    _;
  }

  /// @dev Operations allowed for Governance or Dao addresses
  modifier onlyGovernanceOrDao() {
    require(IController(controller()).isGovernance(msg.sender)
      || IController(controller()).isDao(msg.sender), "not governance or dao");
    _;
  }

  /// @notice Only controller can use it. Clear announce after successful call time-locked function
  /// @param opHash Generated keccak256 opHash
  /// @param opCode TimeLockOpCodes uint8 value
  function clearAnnounce(bytes32 opHash, TimeLockOpCodes opCode, address target) public override onlyController {
    timeLockSchedule[opHash] = 0;
    uint256 idx = 0;
    if (multiOpCodes[opCode]) {
      idx = multiTimeLockIndexes[opCode][target];
    } else {
      idx = timeLockIndexes[opCode];
    }
    require(idx != type(uint256).max, "index not found");

    for (uint256 i = idx; i < timeLockInfos.length - 1; i++) {
      timeLockInfos[i] = timeLockInfos[i + 1];
    }
    timeLockInfos.pop();

    if (multiOpCodes[opCode]) {
      multiTimeLockIndexes[opCode][target] = type(uint256).max;
    } else {
      timeLockIndexes[opCode] = type(uint256).max;
    }
  }

  /// @notice Length of the the array of all undone announced actions
  /// @return Array length
  function timeLockInfosLength() external view returns (uint256) {
    return timeLockInfos.length;
  }

  // ------------------ ANNOUNCES ----------------------------

  /// @notice Only Governance can do it.
  ///         Announce address change. You will able to setup new address after 48h
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
  /// @param newAddress New address
  function announceAddressChange(TimeLockOpCodes opCode, address oldAddress, address newAddress) external onlyGovernance {
    require(timeLockIndexes[opCode] == type(uint256).max, "already announced");
    require(newAddress != address(0), "zero address");
    timeLockSchedule[keccak256(abi.encode(opCode, newAddress))] = block.timestamp + TIME_LOCK;

    address[] memory values = new address[](1);
    values[0] = newAddress;
    timeLockInfos.push(TimeLockInfo(opCode, oldAddress, values, new uint256[](0)));
    timeLockIndexes[opCode] = (timeLockInfos.length - 1);

    emit AddressChangeAnnounce(opCode, newAddress);
  }

  /// @notice Only Governance or DAO can do it.
  ///         Announce ratio change. You will able to setup new ratio after 48h
  /// @param opCode Operation code from the list
  ///                 9 - PsRatio
  ///                 10 - FundRatio
  /// @param numerator New numerator
  /// @param denominator New denominator
  function announceRatioChange(TimeLockOpCodes opCode, uint256 numerator, uint256 denominator) external override onlyGovernanceOrDao {
    require(timeLockIndexes[opCode] == type(uint256).max, "already announced");
    require(numerator <= denominator, "invalid values");
    require(denominator != 0, "cannot divide by 0");
    timeLockSchedule[keccak256(abi.encode(opCode, numerator, denominator))] = block.timestamp + TIME_LOCK;

    uint256[] memory values = new uint256[](2);
    values[0] = numerator;
    values[1] = denominator;
    timeLockInfos.push(TimeLockInfo(opCode, controller(), new address[](0), values));
    timeLockIndexes[opCode] = (timeLockInfos.length - 1);

    emit RatioChangeAnnounced(opCode, numerator, denominator);
  }

  /// @notice Only Governance can do it. Announce token salvage. You will able to salvage after 48h
  /// @param opCode Operation code from the list
  ///                 11 - ControllerSalvage
  ///                 12 - StrategySalvage
  ///                 13 - FundSalvage
  /// @param target Target address
  /// @param token Token that you want to salvage
  /// @param amount Amount that you want to salvage
  function announceTokenMove(TimeLockOpCodes opCode, address target, address token, uint256 amount)
  external onlyGovernance {
    require(timeLockIndexes[opCode] == type(uint256).max, "already announced");
    require(target != address(0), "zero target");
    require(token != address(0), "zero token");
    require(amount != 0, "zero amount");
    timeLockSchedule[keccak256(abi.encode(opCode, target, token, amount))] = block.timestamp + TIME_LOCK;

    address[] memory adrValues = new address[](1);
    adrValues[0] = token;
    uint256[] memory intValues = new uint256[](1);
    intValues[0] = amount;
    timeLockInfos.push(TimeLockInfo(opCode, target, adrValues, intValues));
    timeLockIndexes[opCode] = (timeLockInfos.length - 1);

    emit TokenMoveAnnounced(opCode, target, token, amount);
  }

  /// @notice Only Governance can do it. Announce weekly mint
  /// @param totalAmount Total amount to mint.
  ///                    33% will go to current network, 67% to FundKeeper for other networks
  /// @param _distributor Distributor address, usually NotifyHelper
  /// @param _otherNetworkFund Fund address, usually FundKeeper
  function announceMint(uint256 totalAmount, address _distributor, address _otherNetworkFund) external onlyGovernance {
    TimeLockOpCodes opCode = TimeLockOpCodes.Mint;

    require(timeLockIndexes[opCode] == type(uint256).max, "already announced");
    require(totalAmount != 0, "zero amount");
    require(_distributor != address(0), "zero distributor");
    require(_otherNetworkFund != address(0), "zero fund");

    bytes32 opHash = keccak256(abi.encode(opCode, totalAmount, _distributor, _otherNetworkFund));
    timeLockSchedule[opHash] = block.timestamp + TIME_LOCK;

    address[] memory adrValues = new address[](1);
    adrValues[0] = _distributor;
    adrValues[1] = _otherNetworkFund;
    uint256[] memory intValues = new uint256[](1);
    intValues[0] = totalAmount;
    timeLockInfos.push(TimeLockInfo(opCode, IController(controller()).mintHelper(), adrValues, intValues));
    timeLockIndexes[opCode] = (timeLockInfos.length - 1);

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

  /// @notice Only Governance can do it. Announce Proxy upgrade
  /// @param _contract Proxy contract address for upgrade
  /// @param _implementation New implementation address
  function announceTetuProxyUpgrade(address _contract, address _implementation) public onlyGovernance {
    TimeLockOpCodes opCode = TimeLockOpCodes.TetuProxyUpdate;

    require(multiTimeLockIndexes[opCode][_contract] == type(uint256).max, "already announced");
    require(_contract != address(0), "zero contract");
    require(_implementation != address(0), "zero implementation");

    bytes32 opHash = keccak256(abi.encode(opCode, _contract, _implementation));
    timeLockSchedule[opHash] = block.timestamp + TIME_LOCK;

    address[] memory values = new address[](1);
    values[0] = _implementation;
    timeLockInfos.push(TimeLockInfo(opCode, _contract, values, new uint256[](0)));
    multiTimeLockIndexes[opCode][_contract] = (timeLockInfos.length - 1);

    emit ProxyUpgradeAnnounced(_contract, _implementation);
  }

  /// @notice Only Governance can do it. Announce strategy update for given vaults
  /// @param _targets Vault addresses
  /// @param _strategies Strategy addresses
  function announceStrategyUpgrades(address[] calldata _targets, address[] calldata _strategies) external onlyGovernance {
    TimeLockOpCodes opCode = TimeLockOpCodes.StrategyUpgrade;
    require(_targets.length == _strategies.length, "wrong arrays");
    for (uint256 i = 0; i < _targets.length; i++) {
      require(multiTimeLockIndexes[opCode][_targets[i]] == type(uint256).max, "already announced");
      bytes32 opHash = keccak256(abi.encode(opCode, _targets[i], _strategies[i]));
      timeLockSchedule[opHash] = block.timestamp + TIME_LOCK;

      address[] memory values = new address[](1);
      values[0] = _strategies[i];
      timeLockInfos.push(TimeLockInfo(opCode, _targets[i], values, new uint256[](0)));
      multiTimeLockIndexes[opCode][_targets[i]] = (timeLockInfos.length - 1);

      emit StrategyUpgradeAnnounced(_targets[i], _strategies[i]);
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

}
