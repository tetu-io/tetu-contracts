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
import "../interface/ISmartVault.sol";
import "./Controllable.sol";
import "./VaultControllerStorage.sol";
import "../interface/IAnnouncer.sol";

/// @title Keep vaults settings and provide interface for vault actions
///        Governance should be a Multi-Sig Wallet
/// @dev Use with TetuProxy
/// @author belbix
contract VaultController is Initializable, Controllable, VaultControllerStorage {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ************ VARIABLES **********************
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  ///      Initialize Controllable with sender address
  function initialize(address _controller) external initializer {
    Controllable.initializeControllable(_controller);
    VaultControllerStorage.initializeVaultControllerStorage();
  }

  /// @dev Operations allowed only for Governance address
  modifier onlyGovernance() {
    require(isGovernance(msg.sender), "not governance");
    _;
  }


  /// @dev Operation should be announced (exist in timeLockSchedule map) or new value
  modifier timeLock(bytes32 opHash, IAnnouncer.TimeLockOpCodes opCode, bool isEmptyValue, address target) {
    address announcer = IController(controller()).announcer();
    // empty values setup without time-lock
    if (!isEmptyValue) {
      require(announcer != address(0), "zero announcer");
      require(IAnnouncer(announcer).timeLockSchedule(opHash) > 0, "not announced");
      require(IAnnouncer(announcer).timeLockSchedule(opHash) < block.timestamp, "too early");
    }
    _;
    // clear announce after update
    if (!isEmptyValue) {
      IAnnouncer(announcer).clearAnnounce(opHash, opCode, target);
    }
  }

  //  ---------------------- TIME-LOCK ACTIONS --------------------------

  /// @notice Only Governance can do it
  ///         Change vaults reward boost duration
  /// @param duration Duration value in seconds
  function setRewardBoostDuration(uint256 duration) external onlyGovernance timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.RewardBoostDuration, duration)),
    IAnnouncer.TimeLockOpCodes.RewardBoostDuration,
    rewardBoostDuration() == 0,
    address(0)
  ) {
    _setRewardBoostDuration(duration);
  }

  /// @notice Only Governance can do it
  ///         Change vaults reward boost ratio
  /// @param ratio Ratio value in a range 0-100
  function setRewardRatioWithoutBoost(uint256 ratio) external onlyGovernance timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.RewardRatioWithoutBoost, ratio)),
    IAnnouncer.TimeLockOpCodes.RewardRatioWithoutBoost,
    rewardRatioWithoutBoost() == 0,
    address(0)
  ) {
    require(ratio <= 100, "too high value");
    _setRewardRatioWithoutBoost(ratio);
  }

  // ---------------- NO TIME_LOCK --------------------------

  /// @notice Only Governance can do it. Change statuses of given vaults
  /// @param _targets Vault addresses
  /// @param _statuses Vault statuses
  function changeVaultsStatuses(address[] calldata _targets, bool[] calldata _statuses) external onlyGovernance {
    require(_targets.length == _statuses.length, "wrong arrays");
    for (uint256 i = 0; i < _targets.length; i++) {
      ISmartVault(_targets[i]).changeActivityStatus(_statuses[i]);
    }
  }

  /// @notice Only Governance can do it. Add reward token for given vaults
  /// @param _vaults Vault addresses
  /// @param _rt Reward token
  function addRewardTokens(address[] calldata _vaults, address _rt) external onlyGovernance {
    for (uint256 i = 0; i < _vaults.length; i++) {
      ISmartVault(_vaults[i]).addRewardToken(_rt);
    }
  }

  /// @notice Only Governance can do it. Remove reward token for given vaults
  /// @param _vaults Vault addresses
  /// @param _rt Reward token
  function removeRewardTokens(address[] calldata _vaults, address _rt) external onlyGovernance {
    for (uint256 i = 0; i < _vaults.length; i++) {
      ISmartVault(_vaults[i]).removeRewardToken(_rt);
    }
  }

}
