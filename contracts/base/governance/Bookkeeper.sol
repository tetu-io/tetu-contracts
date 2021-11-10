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
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "../interface/IBookkeeper.sol";
import "./Controllable.sol";
import "../interface/ISmartVault.sol";

/// @title Contract for holding statistical info and doesn't affect any funds.
/// @dev Only not critical functional. Use with TetuProxy
/// @author belbix
contract Bookkeeper is IBookkeeper, Initializable, Controllable {
  using SafeMathUpgradeable for uint256;

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.1.2";

  // DO NOT CHANGE NAMES OR ORDERING!
  /// @dev Add when Controller register vault. Can have another length than strategies.
  address[] public _vaults;
  /// @dev Add when Controller register strategy. Can have another length than vaults.
  address[] public _strategies;
  /// @inheritdoc IBookkeeper
  mapping(address => uint256) public override targetTokenEarned;
  mapping(address => HardWork) private _lastHardWork;
  /// @inheritdoc IBookkeeper
  mapping(address => mapping(address => uint256)) public override vaultUsersBalances;
  /// @inheritdoc IBookkeeper
  mapping(address => mapping(address => mapping(address => uint256))) public override userEarned;
  /// @inheritdoc IBookkeeper
  mapping(address => uint256) public override vaultUsersQuantity;
  /// @dev Hold last price per full share change for given user
  mapping(address => PpfsChange) private _lastPpfsChange;
  /// @dev Stored any FundKeeper earnings by tokens
  mapping(address => uint256) public override fundKeeperEarned;
  /// @dev Hold reward notified amounts for vaults
  mapping(address => mapping(address => uint256[])) public override vaultRewards;
  /// @dev Length of vault rewards arrays
  mapping(address => mapping(address => uint256)) public override vaultRewardsLength;
  /// @dev Strategy earned values stored per each reward notification
  mapping(address => uint256[]) public override strategyEarnedSnapshots;
  /// @dev Timestamp when snapshot created. Has the same length as strategy snapshots
  mapping(address => uint256[]) public override strategyEarnedSnapshotsTime;
  /// @dev Snapshot lengths
  mapping(address => uint256) public override strategyEarnedSnapshotsLength;

  /// @notice Vault added
  event RegisterVault(address value);
  /// @notice Vault removed
  event RemoveVault(address value);
  /// @notice Strategy added
  event RegisterStrategy(address value);
  /// @notice Strategy removed
  event RemoveStrategy(address value);
  /// @notice Strategy earned this TETU amount during doHardWork call
  event RegisterStrategyEarned(address indexed strategy, uint256 amount);
  /// @notice FundKeeper earned this USDC amount during doHardWork call
  event RegisterFundKeeperEarned(address indexed token, uint256 amount);
  /// @notice User deposit/withdraw action
  event RegisterUserAction(address indexed user, uint256 amount, bool deposit);
  /// @notice User claim reward
  event RegisterUserEarned(address indexed user, address vault, address token, uint256 amount);
  /// @notice Vault's PricePer Full Share changed
  event RegisterPpfsChange(address indexed vault, uint256 oldValue, uint256 newValue);
  /// @notice Reward distribution registered
  event RewardDistribution(address indexed vault, address token, uint256 amount, uint256 time);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _controller Controller address
  function initialize(address _controller) external initializer {
    Controllable.initializeControllable(_controller);
  }

  /// @dev Only registered strategy allowed
  modifier onlyStrategy() {
    require(IController(controller()).strategies(msg.sender), "B: Only exist strategy");
    _;
  }

  /// @dev Only FeeRewardForwarder contract allowed
  modifier onlyFeeRewardForwarderOrStrategy() {
    require(IController(controller()).feeRewardForwarder() == msg.sender
      || IController(controller()).strategies(msg.sender), "B: Only exist forwarder or strategy");
    _;
  }

  /// @dev Only registered vault allowed
  modifier onlyVault() {
    require(IController(controller()).vaults(msg.sender), "B: Only exist vault");
    _;
  }

  /// @notice Add Vault and Strategy if they not exist. Only Controller or Governance
  /// @dev Manually we should add a pair vault / strategy for keep both array in the same state
  /// @param _vault Vault address
  /// @param _strategy Strategy address
  function addVaultAndStrategy(address _vault, address _strategy) external onlyControllerOrGovernance {
    addVault(_vault);
    addStrategy(_strategy);
  }

  /// @notice Add Vault if it is not exist. Only Controller sender allowed
  /// @param _vault Vault address
  function addVault(address _vault) public override onlyControllerOrGovernance {
    if (!isVaultExist(_vault)) {
      _vaults.push(_vault);
      emit RegisterVault(_vault);
    }
  }

  /// @notice Add Strategy if it is not exist. Only Controller sender allowed
  /// @param _strategy Strategy address
  function addStrategy(address _strategy) public override onlyControllerOrGovernance {
    if (!isStrategyExist(_strategy)) {
      _strategies.push(_strategy);
      emit RegisterStrategy(_strategy);
    }
  }

  /// @notice Only Strategy action. Save TETU earned values
  /// @dev It should represent 100% of earned rewards including all fees.
  /// @param _targetTokenAmount Earned amount
  function registerStrategyEarned(uint256 _targetTokenAmount) external override onlyStrategy {
    targetTokenEarned[msg.sender] = targetTokenEarned[msg.sender].add(_targetTokenAmount);

    _lastHardWork[msg.sender] = HardWork(
      msg.sender,
      block.number,
      block.timestamp,
      _targetTokenAmount
    );
    emit RegisterStrategyEarned(msg.sender, _targetTokenAmount);
  }

  /// @notice Only FeeRewardForwarder action. Save Fund Token earned value for given token
  /// @param _fundTokenAmount Earned amount
  function registerFundKeeperEarned(address _token, uint256 _fundTokenAmount) external override onlyFeeRewardForwarderOrStrategy {
    fundKeeperEarned[_token] = fundKeeperEarned[_token].add(_fundTokenAmount);
    emit RegisterFundKeeperEarned(_token, _fundTokenAmount);
  }

  /// @notice FeeRewardForwarder action.
  ///         Register Price Per Full Share change for given vault
  /// @param vault Vault address
  /// @param value Price Per Full Share change
  function registerPpfsChange(address vault, uint256 value)
  external override onlyFeeRewardForwarderOrStrategy {
    PpfsChange memory lastPpfs = _lastPpfsChange[vault];
    _lastPpfsChange[vault] = PpfsChange(
      vault,
      block.number,
      block.timestamp,
      value,
      lastPpfs.block,
      lastPpfs.time,
      lastPpfs.value
    );
    emit RegisterPpfsChange(vault, lastPpfs.value, value);
  }

  /// @notice Vault action.
  ///         Register reward distribution
  /// @param vault Vault address
  /// @param rewardToken Reward token address
  /// @param amount Reward amount
  function registerRewardDistribution(address vault, address rewardToken, uint256 amount)
  external override onlyVault {
    vaultRewards[vault][rewardToken].push(amount);
    vaultRewardsLength[vault][rewardToken] = vaultRewards[vault][rewardToken].length;

    address strategy = ISmartVault(vault).strategy();
    strategyEarnedSnapshots[strategy].push(targetTokenEarned[strategy]);
    strategyEarnedSnapshotsTime[strategy].push(block.timestamp);
    strategyEarnedSnapshotsLength[strategy] = strategyEarnedSnapshots[strategy].length;
    emit RewardDistribution(vault, rewardToken, amount, block.timestamp);
  }

  /// @notice Vault action. Register user's deposit/withdraw
  /// @dev Should register any mint/burn of the share token
  /// @param _user User address
  /// @param _amount Share amount for deposit/withdraw
  /// @param _deposit true = deposit, false = withdraw
  function registerUserAction(address _user, uint256 _amount, bool _deposit)
  external override onlyVault {
    if (vaultUsersBalances[msg.sender][_user] == 0) {
      vaultUsersQuantity[msg.sender] = vaultUsersQuantity[msg.sender].add(1);
    }
    if (_deposit) {
      vaultUsersBalances[msg.sender][_user] = vaultUsersBalances[msg.sender][_user].add(_amount);
    } else {
      // avoid overflow if we missed something
      // in this unreal case better do nothing
      if (vaultUsersBalances[msg.sender][_user] >= _amount) {
        vaultUsersBalances[msg.sender][_user] = vaultUsersBalances[msg.sender][_user].sub(_amount);
      }
    }
    if (vaultUsersBalances[msg.sender][_user] == 0) {
      vaultUsersQuantity[msg.sender] = vaultUsersQuantity[msg.sender].sub(1);
    }
    emit RegisterUserAction(_user, _amount, _deposit);
  }

  /// @notice Vault action. Register any share token transfer.
  ///         Burn/mint ignored - should be handled in registerUserAction()
  /// @param from Sender address
  /// @param to Recipient address
  /// @param amount Transaction amount
  function registerVaultTransfer(address from, address to, uint256 amount) external override onlyVault {
    // in this unreal cases better to do nothing
    if (vaultUsersBalances[msg.sender][from] < amount || amount == 0) {
      return;
    }

    // don't count mint and burn - it should be covered in registerUserAction
    if (from == address(0) || to == address(0)) {
      return;
    }

    // decrease sender balance
    vaultUsersBalances[msg.sender][from] = vaultUsersBalances[msg.sender][from].sub(amount);

    // if recipient didn't have balance - increase user quantity
    if (vaultUsersBalances[msg.sender][to] == 0) {
      vaultUsersQuantity[msg.sender] = vaultUsersQuantity[msg.sender].add(1);
    }
    // increase recipient balance
    vaultUsersBalances[msg.sender][to] = vaultUsersBalances[msg.sender][to].add(amount);

    // if sender sent all amount decrease user quantity
    if (vaultUsersBalances[msg.sender][from] == 0) {
      vaultUsersQuantity[msg.sender] = vaultUsersQuantity[msg.sender].sub(1);
    }
  }

  /// @notice Only Vault can call it. Register user's claimed amount of given token
  /// @param _user User address
  /// @param _vault Vault address
  /// @param _rt Reward Token address
  /// @param _amount Claimed amount
  function registerUserEarned(address _user, address _vault, address _rt, uint256 _amount)
  external override onlyVault {
    userEarned[_user][_vault][_rt] = userEarned[_user][_vault][_rt].add(_amount);
    emit RegisterUserEarned(_user, _vault, _rt, _amount);
  }

  /// @notice Return vaults array
  /// @dev This function should not use in any critical logics because DoS possible
  /// @return Array of all registered vaults
  function vaults() external override view returns (address[] memory) {
    return _vaults;
  }

  /// @notice Return vaults array length
  /// @return Length of Array of all registered vaults
  function vaultsLength() external override view returns (uint256) {
    return _vaults.length;
  }

  /// @notice Return strategy array
  /// @dev This function should not use in any critical logics because DoS possible
  /// @return Array of all registered strategies
  function strategies() external override view returns (address[] memory) {
    return _strategies;
  }

  /// @notice Return strategies array length
  /// @return Length of Array of all registered strategies
  function strategiesLength() external override view returns (uint256) {
    return _strategies.length;
  }

  /// @notice Return info about last doHardWork call for given vault
  /// @param strategy Strategy address
  /// @return HardWork struct with result
  function lastHardWork(address strategy) external view override returns (HardWork memory) {
    return _lastHardWork[strategy];
  }

  /// @notice Return info about last PricePerFullShare change for given vault
  /// @param vault Vault address
  /// @return PpfsChange struct with result
  function lastPpfsChange(address vault) external view override returns (PpfsChange memory) {
    return _lastPpfsChange[vault];
  }

  /// @notice Return true for registered Vault
  /// @param _value Vault address
  /// @return true if Vault registered
  function isVaultExist(address _value) internal view returns (bool) {
    for (uint256 i = 0; i < _vaults.length; i++) {
      if (_vaults[i] == _value) {
        return true;
      }
    }
    return false;
  }

  /// @notice Return true for registered Strategy
  /// @param _value Strategy address
  /// @return true if Strategy registered
  function isStrategyExist(address _value) internal view returns (bool) {
    for (uint256 i = 0; i < _strategies.length; i++) {
      if (_strategies[i] == _value) {
        return true;
      }
    }
    return false;
  }

  /// @notice Governance action. Remove given Vault from vaults array
  /// @param index Index of vault in the vault array
  function removeFromVaults(uint256 index) external onlyControllerOrGovernance {
    require(index < _vaults.length, "B: Wrong index");
    emit RemoveVault(_vaults[index]);
    _vaults[index] = _vaults[_vaults.length - 1];
    _vaults.pop();
  }

  /// @notice Governance action. Remove given Strategy from strategies array
  /// @param index Index of strategy in the strategies array
  function removeFromStrategies(uint256 index) external onlyControllerOrGovernance {
    require(index < _strategies.length, "B: Wrong index");
    emit RemoveStrategy(_strategies[index]);
    _strategies[index] = _strategies[_strategies.length - 1];
    _strategies.pop();
  }

}
