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
import "../interface/IVaultProxy.sol";
import "../interface/IFundKeeper.sol";
import "./ControllerStorage.sol";

/// @title A central contract for control everything.
///        Governance should be a Multi-Sig Wallet
/// @dev Use with TetuProxy
/// @author belbix
contract Controller is Initializable, Controllable, ControllerStorage {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  // ************ VARIABLES **********************
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";

  /// @dev Allowed contracts for deposit to vaults
  mapping(address => bool) public override whiteList;
  /// @dev Registered vaults
  mapping(address => bool) public override vaults;
  /// @dev Registered strategies
  mapping(address => bool) public override strategies;
  /// @dev Allowed address for do maintenance work
  mapping(address => bool) public hardWorkers;
  /// @dev Allowed address for reward distributing
  mapping(address => bool) public rewardDistribution;

  // ************ EVENTS **********************

  /// @notice HardWorker added
  event HardWorkerAdded(address value);
  /// @notice HardWorker removed
  event HardWorkerRemoved(address value);
  /// @notice Contract added to whitelist
  event AddedToWhiteList(address value);
  /// @notice Contract removed from whitelist
  event RemovedFromWhiteList(address value);
  /// @notice Vault and Strategy pair registered
  event VaultAndStrategyAdded(address vault, address strategy);
  /// @notice Tokens moved from Controller contract to Governance
  event Salvaged(address indexed token, uint256 amount);
  /// @notice Tokens moved from Strategy contract to Governance
  event SalvagedStrategy(address indexed strategy, address indexed token, uint256 amount);
  /// @notice Tokens moved from Fund contract to Controller
  event SalvagedFund(address indexed fund, address indexed token, uint256 amount);
  /// @notice DoHardWork completed and PricePerFullShare changed
  event SharePriceChangeLog(
    address indexed vault,
    address indexed strategy,
    uint256 oldSharePrice,
    uint256 newSharePrice,
    uint256 timestamp
  );

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  ///      Initialize Controllable with sender address
  ///      Setup default values for PS and Fund ratio
  function initialize() external initializer {
    Controllable.initializeControllable(address(this));
    ControllerStorage.initializeControllerStorage(
      msg.sender
    );
    // 100% by default
    setPSNumeratorDenominator(1000, 1000);
    // 10% by default
    setFundNumeratorDenominator(100, 1000);
  }

  /// @dev Operations allowed only for Governance address
  modifier onlyGovernance() {
    require(isGovernance(msg.sender), "not governance");
    _;
  }

  /// @dev Operations allowed for Governance or Dao addresses
  modifier onlyGovernanceOrDao() {
    require(isGovernance(msg.sender) || isDao(msg.sender), "not governance or dao");
    _;
  }

  /// @dev Operations allowed only for registered Vaults
  modifier onlyVault() {
    require(vaults[msg.sender], "only exist active vault");
    _;
  }

  /// @dev Operations allowed for Governance or HardWorker addresses
  modifier onlyHardWorkerOrGovernance() {
    require(IController(controller()).isHardWorker(msg.sender)
      || IController(controller()).isGovernance(msg.sender), "only hardworker");
    _;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Only Governance can do it. Change governance address.
  /// @param _governance New governance address
  function setGovernance(address _governance) external onlyGovernance {
    require(_governance != address(0), "zero address");
    _setGovernance(_governance);
  }

  /// @notice Only Governance can do it. Change DAO address.
  /// @param _dao New DAO address
  function setDao(address _dao) external onlyGovernance {
    require(_dao != address(0), "zero address");
    _setDao(_dao);
  }

  /// @notice Only Governance can do it. Change FeeRewardForwarder address.
  /// @param _feeRewardForwarder New FeeRewardForwarder address
  function setFeeRewardForwarder(address _feeRewardForwarder) external onlyGovernance {
    require(_feeRewardForwarder != address(0), "zero address");
    rewardDistribution[feeRewardForwarder()] = false;
    _setFeeRewardForwarder(_feeRewardForwarder);
    rewardDistribution[feeRewardForwarder()] = true;
  }

  /// @notice Only Governance can do it. Change Bookkeeper address.
  /// @param _bookkeeper New Bookkeeper address
  function setBookkeeper(address _bookkeeper) external onlyGovernance {
    require(_bookkeeper != address(0), "zero address");
    _setBookkeeper(_bookkeeper);
  }

  /// @notice Only Governance can do it. Change MintHelper address.
  /// @param _newValue New MintHelper address
  function setMintHelper(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setMintHelper(_newValue);
  }

  /// @notice Only Governance can do it. Change RewardToken(TETU) address.
  /// @param _newValue New RewardToken address
  function setRewardToken(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setRewardToken(_newValue);
  }

  /// @notice Only Governance can do it. Change FundToken(USDC by default) address.
  /// @param _newValue New FundToken address
  function setFundToken(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setFundToken(_newValue);
  }

  /// @notice Only Governance can do it. Change ProfitSharing vault address.
  /// @param _newValue New ProfitSharing vault address
  function setPsVault(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setPsVault(_newValue);
  }

  /// @notice Only Governance can do it. Change FundKeeper address.
  /// @param _newValue New FundKeeper address
  function setFund(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setFund(_newValue);
  }

  /// @notice Only Governance can do it. Add/Remove Reward Distributor address
  /// @param _newRewardDistribution Reward Distributor's addresses
  /// @param _flag Reward Distributor's flags - true active, false deactivated
  function setRewardDistribution(address[] calldata _newRewardDistribution, bool _flag) external onlyGovernance {
    for (uint256 i = 0; i < _newRewardDistribution.length; i++) {
      rewardDistribution[_newRewardDistribution[i]] = _flag;
    }
  }

  /// @notice Only Governance or DAO can do it. Change Profit Sharing fee ratio.
  ///         numerator/denominator = ratio
  /// @param numerator Ratio numerator. Should be less than denominator
  /// @param denominator Ratio denominator. Should be greater than zero
  function setPSNumeratorDenominator(uint256 numerator, uint256 denominator) public onlyGovernanceOrDao {
    require(numerator <= denominator, "invalid values");
    require(denominator != 0, "cannot divide by 0");
    _setPsNumerator(numerator);
    _setPsDenominator(denominator);
  }

  /// @notice Only Governance or DAO can do it. Change Fund fee ratio.
  ///         numerator/denominator = ratio
  /// @param numerator Ratio numerator. Should be less than denominator
  /// @param denominator Ratio denominator. Should be greater than zero
  function setFundNumeratorDenominator(uint256 numerator, uint256 denominator) public onlyGovernanceOrDao {
    require(numerator <= denominator, "invalid values");
    require(denominator != 0, "cannot divide by 0");
    _setFundNumerator(numerator);
    _setFundDenominator(denominator);
  }

  /// @notice Only Governance can do it. Add HardWorker address.
  /// @param _worker New HardWorker address
  function addHardWorker(address _worker) external onlyGovernance {
    require(_worker != address(0), "_worker must be defined");
    hardWorkers[_worker] = true;
    emit HardWorkerAdded(_worker);
  }

  /// @notice Only Governance can do it. Remove HardWorker address.
  /// @param _worker Exist HardWorker address
  function removeHardWorker(address _worker) external onlyGovernance {
    require(_worker != address(0), "_worker must be defined");
    hardWorkers[_worker] = false;
    emit HardWorkerRemoved(_worker);
  }

  /// @notice Only Governance or DAO can do it. Add to whitelist an array of addresses
  /// @param _targets An array of contracts
  function addToWhiteListMulti(address[] calldata _targets) external onlyGovernanceOrDao {
    for (uint256 i = 0; i < _targets.length; i++) {
      addToWhiteList(_targets[i]);
    }
  }

  /// @notice Only Governance or DAO can do it. Add to whitelist a contract address
  /// @param _target Contract address
  function addToWhiteList(address _target) public onlyGovernanceOrDao {
    whiteList[_target] = true;
    emit AddedToWhiteList(_target);
  }

  /// @notice Only Governance or DAO can do it. Remove from whitelist an array of addresses
  /// @param _targets An array of contracts
  function removeFromWhiteListMulti(address[] calldata _targets) external onlyGovernanceOrDao {
    for (uint256 i = 0; i < _targets.length; i++) {
      removeFromWhiteList(_targets[i]);
    }
  }

  /// @notice Only Governance or DAO can do it. Remove from whitelist a contract address
  /// @param _target Contract address
  function removeFromWhiteList(address _target) public onlyGovernanceOrDao {
    whiteList[_target] = false;
    emit RemovedFromWhiteList(_target);
  }

  /// @notice Only Governance can do it. Change statuses of given vaults
  /// @param _targets Vault addresses
  /// @param _statuses Vault statuses
  function changeVaultsStatuses(address[] calldata _targets, bool[] calldata _statuses) external onlyGovernance {
    require(_targets.length == _statuses.length, "wrong arrays");
    for (uint256 i = 0; i < _targets.length; i++) {
      ISmartVault(_targets[i]).changeActivityStatus(_statuses[i]);
    }
  }

  /// @notice Only Governance can do it. Change statuses of given vaults
  /// @param _targets Vault addresses
  /// @param _implementations Vault statuses
  function scheduleVaultsUpgrades(address[] calldata _targets, address[] calldata _implementations) external onlyGovernance {
    require(_targets.length == _implementations.length, "wrong arrays");
    for (uint256 i = 0; i < _targets.length; i++) {
      IUpgradeSource(_targets[i]).scheduleUpgrade(_implementations[i]);
    }
  }

  /// @notice Only Governance can do it. Upgrade vaults scheduled for upgrade
  /// @param _targets Vault addresses
  function vaultsUpgrades(address[] calldata _targets) external onlyGovernance {
    for (uint256 i = 0; i < _targets.length; i++) {
      IVaultProxy(_targets[i]).upgrade();
    }
  }

  /// @notice Only Governance can do it. Announce strategy update for given vaults
  /// @param _targets Vault addresses
  /// @param _strategies Strategy addresses
  function announceStrategyUpgrades(address[] calldata _targets, address[] calldata _strategies) external onlyGovernance {
    require(_targets.length == _strategies.length, "wrong arrays");
    for (uint256 i = 0; i < _targets.length; i++) {
      ISmartVault(_targets[i]).announceStrategyUpdate(_strategies[i]);
    }
  }

  /// @notice Only Governance can do it. Set announced strategies for given vaults
  /// @param _targets Vault addresses
  /// @param _strategies Strategy addresses
  function setVaultStrategies(address[] calldata _targets, address[] calldata _strategies) external onlyGovernance {
    require(_targets.length == _strategies.length, "wrong arrays");
    for (uint256 i = 0; i < _targets.length; i++) {
      ISmartVault(_targets[i]).setStrategy(_strategies[i]);
    }
  }

  /// @notice Only Governance can do it. Register pairs Vault/Strategy
  /// @param _vaults Vault addresses
  /// @param _strategies Strategy addresses
  function addVaultsAndStrategies(address[] memory _vaults, address[] memory _strategies) external onlyGovernance {
    require(_vaults.length == _strategies.length, "arrays wrong length");
    for (uint256 i = 0; i < _vaults.length; i++) {
      addVaultAndStrategy(_vaults[i], _strategies[i]);
    }
  }

  /// @notice Only Governance can do it. Register a pair Vault/Strategy
  /// @param _vault Vault addresses
  /// @param _strategy Strategy addresses
  function addVaultAndStrategy(address _vault, address _strategy) public override onlyGovernance {
    require(_vault != address(0), "new vault shouldn't be empty");
    require(!vaults[_vault], "vault already exists");
    require(!strategies[_strategy], "strategy already exists");
    require(_strategy != address(0), "new strategy must not be empty");

    vaults[_vault] = true;
    IBookkeeper(bookkeeper()).addVault(_vault);

    // adding happens while setting
    ISmartVault(_vault).setStrategy(_strategy);
    emit VaultAndStrategyAdded(_vault, _strategy);
  }

  /// @notice Only Vault can do it. Register Strategy. Vault call it when gov set a strategy
  /// @param _strategy Strategy addresses
  function addStrategy(address _strategy) external override onlyVault {
    if (!strategies[_strategy]) {
      strategies[_strategy] = true;
      IBookkeeper(bookkeeper()).addStrategy(_strategy);
    }
  }

  /// @notice Only Governance or HardWorker can do it. Call doHardWork from given Vault
  /// @param _vault Vault addresses
  function doHardWork(address _vault) external onlyHardWorkerOrGovernance {
    require(isValidVault(_vault), "not vault");
    uint256 oldSharePrice = ISmartVault(_vault).getPricePerFullShare();
    ISmartVault(_vault).doHardWork();
    emit SharePriceChangeLog(
      _vault,
      ISmartVault(_vault).strategy(),
      oldSharePrice,
      ISmartVault(_vault).getPricePerFullShare(),
      block.timestamp
    );
  }

  /// @notice Only Governance can do it. Transfer token from this contract to governance address
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint256 _amount) external onlyGovernance {
    IERC20(_token).safeTransfer(governance(), _amount);
    emit Salvaged(_token, _amount);
  }

  /// @notice Only Governance can do it. Transfer token from strategy to governance address
  /// @param _strategy Strategy address
  /// @param _token Token address
  /// @param _amount Token amount
  function salvageStrategy(address _strategy, address _token, uint256 _amount) external onlyGovernance {
    // the strategy is responsible for maintaining the list of
    // salvagable tokens, to make sure that governance cannot come
    // in and take away the coins
    IStrategy(_strategy).salvage(governance(), _token, _amount);
    emit SalvagedStrategy(_strategy, _token, _amount);
  }

  /// @notice Only Governance can do it. Transfer token from FundKeeper to controller
  /// @param _fund FundKeeper address
  /// @param _token Token address
  /// @param _amount Token amount
  function salvageFund(address _fund, address _token, uint256 _amount) external onlyGovernance {
    IFundKeeper(_fund).salvage(_token, _amount);
    emit SalvagedFund(_fund, _token, _amount);
  }

  // ***************** EXTERNAL *******************************

  /// @notice Return true if the given address is governance
  /// @param _adr Address for check
  /// @return true if it is a governance address
  function isGovernance(address _adr) public view override returns (bool) {
    return governance() == _adr;
  }

  /// @notice Return true if the given address is DAO
  /// @param _adr Address for check
  /// @return true if it is a DAO address
  function isDao(address _adr) public view override returns (bool) {
    return dao() == _adr;
  }

  /// @notice Return true if the given address is a HardWorker or Governance
  /// @param _adr Address for check
  /// @return true if it is a HardWorker or Governance
  function isHardWorker(address _adr) public override view returns (bool) {
    return hardWorkers[_adr] || isGovernance(_adr);
  }

  /// @notice Return true if the given address is a Reward Distributor or Governance or Strategy
  /// @param _adr Address for check
  /// @return true if it is a Reward Distributor or Governance or Strategy
  function isRewardDistributor(address _adr) public override view returns (bool) {
    return rewardDistribution[_adr] || isGovernance(_adr) || isValidStrategy(_adr);
  }

  /// @notice Return true if the given address:
  ///         - not smart contract
  ///         - added to whitelist
  ///         - governance address
  ///         - hardworker
  ///         - reward distributor
  ///         - registered vault
  ///         - registered strategy
  /// @param _adr Address for check
  /// @return true if the address allowed
  function isAllowedUser(address _adr) external view override returns (bool) {
    return isNotSmartContract(_adr)
    || whiteList[_adr]
    || isGovernance(_adr)
    || isHardWorker(_adr)
    || isRewardDistributor(_adr)
    || vaults[_adr]
    || strategies[_adr];
  }

  /// @notice Return true if given address is not smart contract but wallet address
  /// @dev it is not 100% guarantee after EIP-3074 implementation
  ///       use it as an additional check
  /// @param _adr Address for check
  /// @return true if the address is a wallet
  function isNotSmartContract(address _adr) private view returns (bool) {
    return _adr == tx.origin;
  }

  /// @notice Return true if the given address is registered vault
  /// @param _vault Address for check
  /// @return true if it is a registered vault
  function isValidVault(address _vault) public override view returns (bool) {
    return vaults[_vault];
  }

  /// @notice Return true if the given address is registered strategy
  /// @param _strategy Address for check
  /// @return true if it is a registered strategy
  function isValidStrategy(address _strategy) public override view returns (bool) {
    return strategies[_strategy];
  }
}
