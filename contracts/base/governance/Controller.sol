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

import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/IERC20.sol";
import "../interface/IStrategy.sol";
import "../interface/ISmartVault.sol";
import "../interface/IFeeRewardForwarder.sol";
import "../interface/IBookkeeper.sol";
import "../interface/IUpgradeSource.sol";
import "../interface/IFundKeeper.sol";
import "../interface/ITetuProxy.sol";
import "../interface/IMintHelper.sol";
import "../interface/IAnnouncer.sol";
import "./ControllerStorage.sol";
import "./Controllable.sol";

/// @title A central contract for control everything.
///        Governance should be a Multi-Sig Wallet
/// @dev Use with TetuProxy
/// @author belbix
contract Controller is Initializable, Controllable, ControllerStorage {
  using SafeERC20 for IERC20;
  using Address for address;

  // ************ VARIABLES **********************
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.3.0";

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
  /// @dev Allowed address for getting 100% rewards without vesting
  mapping(address => bool) public pureRewardConsumers;

  // ************ EVENTS **********************

  /// @notice HardWorker added
  event HardWorkerAdded(address value);
  /// @notice HardWorker removed
  event HardWorkerRemoved(address value);
  /// @notice Contract whitelist status changed
  event WhiteListStatusChanged(address target, bool status);
  /// @notice Vault and Strategy pair registered
  event VaultAndStrategyAdded(address vault, address strategy);
  /// @notice Tokens moved from Controller contract to Governance
  event ControllerTokenMoved(address indexed recipient, address indexed token, uint256 amount);
  /// @notice Tokens moved from Strategy contract to Governance
  event StrategyTokenMoved(address indexed strategy, address indexed token, uint256 amount);
  /// @notice Tokens moved from Fund contract to Controller
  event FundKeeperTokenMoved(address indexed fund, address indexed token, uint256 amount);
  /// @notice DoHardWork completed and PricePerFullShare changed
  event SharePriceChangeLog(
    address indexed vault,
    address indexed strategy,
    uint256 oldSharePrice,
    uint256 newSharePrice,
    uint256 timestamp
  );
  event VaultStrategyChanged(address vault, address oldStrategy, address newStrategy);
  event ProxyUpgraded(address target, address oldLogic, address newLogic);
  event Minted(
    address mintHelper,
    uint totalAmount,
    address distributor,
    address otherNetworkFund,
    bool mintAllAvailable
  );
  event DistributorChanged(address distributor);

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

  // ************* MODIFIERS AND FUNCTIONS FOR STRICT ACCESS ********************

  /// @dev Operations allowed only for Governance address
  function onlyGovernance() view private {
    require(_governance() == msg.sender, "C: Not governance");
  }

  /// @dev Operations allowed for Governance or Dao addresses
  function onlyGovernanceOrDao() view private {
    require(_governance() == msg.sender || _dao() == msg.sender, "C: Not governance or dao");
  }

  /// @dev Operation should be announced (exist in timeLockSchedule map) or new value
  modifier timeLock(bytes32 opHash, IAnnouncer.TimeLockOpCodes opCode, bool isEmptyValue, address target) {
    // empty values setup without time-lock
    if (!isEmptyValue) {
      require(_announcer() != address(0), "C: Zero announcer");
      require(IAnnouncer(_announcer()).timeLockSchedule(opHash) > 0, "C: Not announced");
      require(IAnnouncer(_announcer()).timeLockSchedule(opHash) < block.timestamp, "C: Too early");
    }
    _;
    // clear announce after update
    if (!isEmptyValue) {
      IAnnouncer(_announcer()).clearAnnounce(opHash, opCode, target);
    }
  }

  // ************ GOVERNANCE ACTIONS **************************


  //  ---------------------- TIME-LOCK ACTIONS --------------------------

  /// @notice Only Governance can do it. Set announced strategies for given vaults
  /// @param _vaults Vault addresses
  /// @param _strategies Strategy addresses
  function setVaultStrategyBatch(address[] calldata _vaults, address[] calldata _strategies) external {
    onlyGovernance();
    require(_vaults.length == _strategies.length, "C: Wrong arrays");
    for (uint256 i = 0; i < _vaults.length; i++) {
      _setVaultStrategy(_vaults[i], _strategies[i]);
    }
  }

  /// @notice Only Governance can do it. Set announced strategy for given vault
  /// @param _target Vault address
  /// @param _strategy Strategy address
  function _setVaultStrategy(address _target, address _strategy) private
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.StrategyUpgrade, _target, _strategy)),
    IAnnouncer.TimeLockOpCodes.StrategyUpgrade,
    ISmartVault(_target).strategy() == address(0),
    _target
  ) {
    emit VaultStrategyChanged(_target, ISmartVault(_target).strategy(), _strategy);
    ISmartVault(_target).setStrategy(_strategy);
  }

  /// @notice Only Governance can do it. Upgrade batch announced proxies
  /// @param _contracts Array of Proxy contract addresses for upgrade
  /// @param _implementations Array of New implementation addresses
  function upgradeTetuProxyBatch(
    address[] calldata _contracts,
    address[] calldata _implementations
  ) external {
    onlyGovernance();
    require(_contracts.length == _implementations.length, "wrong arrays");
    for (uint256 i = 0; i < _contracts.length; i++) {
      _upgradeTetuProxy(_contracts[i], _implementations[i]);
    }
  }

  /// @notice Only Governance can do it. Upgrade announced proxy
  /// @param _contract Proxy contract address for upgrade
  /// @param _implementation New implementation address
  function _upgradeTetuProxy(address _contract, address _implementation) private
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.TetuProxyUpdate, _contract, _implementation)),
    IAnnouncer.TimeLockOpCodes.TetuProxyUpdate,
    false,
    _contract
  ) {
    emit ProxyUpgraded(_contract, ITetuProxy(_contract).implementation(), _implementation);
    ITetuProxy(_contract).upgrade(_implementation);
  }

  /// @notice Only Governance can do it. Call announced mint
  /// @param totalAmount Total amount to mint.
  ///                    33% will go to current network, 67% to FundKeeper for other networks
  /// @param mintAllAvailable if true instead of amount will be used maxTotalSupplyForCurrentBlock - totalSupply
  function mintAndDistribute(
    uint256 totalAmount,
    bool mintAllAvailable
  ) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.Mint, totalAmount, distributor(), fund(), mintAllAvailable)),
    IAnnouncer.TimeLockOpCodes.Mint,
    false,
    address(0)
  ) {
    onlyGovernance();
    require(distributor() != address(0), "C: Zero distributor");
    require(fund() != address(0), "C: Zero fund");
    IMintHelper(mintHelper()).mintAndDistribute(totalAmount, distributor(), fund(), mintAllAvailable);
    emit Minted(mintHelper(), totalAmount, distributor(), fund(), mintAllAvailable);
  }

  //  ---------------------- TIME-LOCK ADDRESS CHANGE --------------------------

  /// @notice Only Governance can do it. Change governance address.
  /// @param newValue New governance address
  function setGovernance(address newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.Governance, newValue)),
    IAnnouncer.TimeLockOpCodes.Governance,
    _governance() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setGovernance(newValue);
  }

  /// @notice Only Governance can do it. Change DAO address.
  /// @param newValue New DAO address
  function setDao(address newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.Dao, newValue)),
    IAnnouncer.TimeLockOpCodes.Dao,
    _dao() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setDao(newValue);
  }

  /// @notice Only Governance can do it. Change FeeRewardForwarder address.
  /// @param _feeRewardForwarder New FeeRewardForwarder address
  function setFeeRewardForwarder(address _feeRewardForwarder) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.FeeRewardForwarder, _feeRewardForwarder)),
    IAnnouncer.TimeLockOpCodes.FeeRewardForwarder,
    feeRewardForwarder() == address(0),
    address(0)
  ) {
    onlyGovernance();
    rewardDistribution[feeRewardForwarder()] = false;
    _setFeeRewardForwarder(_feeRewardForwarder);
    rewardDistribution[feeRewardForwarder()] = true;
  }

  /// @notice Only Governance can do it. Change Bookkeeper address.
  /// @param newValue New Bookkeeper address
  function setBookkeeper(address newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.Bookkeeper, newValue)),
    IAnnouncer.TimeLockOpCodes.Bookkeeper,
    _bookkeeper() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setBookkeeper(newValue);
  }

  /// @notice Only Governance can do it. Change MintHelper address.
  /// @param _newValue New MintHelper address
  function setMintHelper(address _newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.MintHelper, _newValue)),
    IAnnouncer.TimeLockOpCodes.MintHelper,
    mintHelper() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setMintHelper(_newValue);
    // for reduce the chance of DoS check new implementation
    require(IMintHelper(mintHelper()).devFundsList(0) != address(0), "C: Wrong");
  }

  /// @notice Only Governance can do it. Change RewardToken(TETU) address.
  /// @param _newValue New RewardToken address
  function setRewardToken(address _newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.RewardToken, _newValue)),
    IAnnouncer.TimeLockOpCodes.RewardToken,
    rewardToken() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setRewardToken(_newValue);
  }

  /// @notice Only Governance can do it. Change FundToken(USDC by default) address.
  /// @param _newValue New FundToken address
  function setFundToken(address _newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.FundToken, _newValue)),
    IAnnouncer.TimeLockOpCodes.FundToken,
    fundToken() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setFundToken(_newValue);
  }

  /// @notice Only Governance can do it. Change ProfitSharing vault address.
  /// @param _newValue New ProfitSharing vault address
  function setPsVault(address _newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.PsVault, _newValue)),
    IAnnouncer.TimeLockOpCodes.PsVault,
    psVault() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setPsVault(_newValue);
  }

  /// @notice Only Governance can do it. Change FundKeeper address.
  /// @param _newValue New FundKeeper address
  function setFund(address _newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.Fund, _newValue)),
    IAnnouncer.TimeLockOpCodes.Fund,
    fund() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setFund(_newValue);
  }

  /// @notice Only Governance can do it. Change Announcer address.
  ///         Has dedicated time-lock logic for avoiding collisions.
  /// @param _newValue New Announcer address
  function setAnnouncer(address _newValue) external {
    onlyGovernance();
    bytes32 opHash = keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.Announcer, _newValue));
    if (_announcer() != address(0)) {
      require(IAnnouncer(_announcer()).timeLockSchedule(opHash) > 0, "C: Not announced");
      require(IAnnouncer(_announcer()).timeLockSchedule(opHash) < block.timestamp, "C: Too early");
    }

    _setAnnouncer(_newValue);
    // clear announce after update not necessary

    // check new announcer implementation for reducing the chance of DoS
    IAnnouncer.TimeLockInfo memory info = IAnnouncer(_announcer()).timeLockInfo(0);
    require(info.opCode == IAnnouncer.TimeLockOpCodes.ZeroPlaceholder, "C: Wrong");
  }

  /// @notice Only Governance can do it. Change FundKeeper address.
  /// @param _newValue New FundKeeper address
  function setVaultController(address _newValue) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.VaultController, _newValue)),
    IAnnouncer.TimeLockOpCodes.VaultController,
    vaultController() == address(0),
    address(0)
  ) {
    onlyGovernance();
    _setVaultController(_newValue);
  }

  // ------------------ TIME-LOCK RATIO CHANGE -------------------

  /// @notice Only Governance or DAO can do it. Change Profit Sharing fee ratio.
  ///         numerator/denominator = ratio
  /// @param numerator Ratio numerator. Should be less than denominator
  /// @param denominator Ratio denominator. Should be greater than zero
  function setPSNumeratorDenominator(uint256 numerator, uint256 denominator) public override
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.PsRatio, numerator, denominator)),
    IAnnouncer.TimeLockOpCodes.PsRatio,
    psNumerator() == 0 && psDenominator() == 0,
    address(0)
  ) {
    onlyGovernanceOrDao();
    _setPsNumerator(numerator);
    _setPsDenominator(denominator);
  }

  /// @notice Only Governance or DAO can do it. Change Fund fee ratio.
  ///         numerator/denominator = ratio
  /// @param numerator Ratio numerator. Should be less than denominator
  /// @param denominator Ratio denominator. Should be greater than zero
  function setFundNumeratorDenominator(uint256 numerator, uint256 denominator) public override
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.FundRatio, numerator, denominator)),
    IAnnouncer.TimeLockOpCodes.FundRatio,
    fundNumerator() == 0 && fundDenominator() == 0,
    address(0)
  ) {
    onlyGovernanceOrDao();
    _setFundNumerator(numerator);
    _setFundDenominator(denominator);
  }

  // ------------------ TIME-LOCK SALVAGE -------------------

  /// @notice Only Governance can do it. Transfer token from this contract to governance address
  /// @param _recipient Recipient address
  /// @param _token Token address
  /// @param _amount Token amount
  function controllerTokenMove(address _recipient, address _token, uint256 _amount) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.ControllerTokenMove, _recipient, _token, _amount)),
    IAnnouncer.TimeLockOpCodes.ControllerTokenMove,
    false,
    address(0)
  ) {
    onlyGovernance();
    IERC20(_token).safeTransfer(_recipient, _amount);
    emit ControllerTokenMoved(_recipient, _token, _amount);
  }

  /// @notice Only Governance can do it. Transfer token from strategy to governance address
  /// @param _strategy Strategy address
  /// @param _token Token address
  /// @param _amount Token amount
  function strategyTokenMove(address _strategy, address _token, uint256 _amount) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.StrategyTokenMove, _strategy, _token, _amount)),
    IAnnouncer.TimeLockOpCodes.StrategyTokenMove,
    false,
    address(0)
  ) {
    onlyGovernance();
    // the strategy is responsible for maintaining the list of
    // salvagable tokens, to make sure that governance cannot come
    // in and take away the coins
    IStrategy(_strategy).salvage(_governance(), _token, _amount);
    emit StrategyTokenMoved(_strategy, _token, _amount);
  }

  /// @notice Only Governance can do it. Transfer token from FundKeeper to controller
  /// @param _fund FundKeeper address
  /// @param _token Token address
  /// @param _amount Token amount
  function fundKeeperTokenMove(address _fund, address _token, uint256 _amount) external
  timeLock(
    keccak256(abi.encode(IAnnouncer.TimeLockOpCodes.FundTokenMove, _fund, _token, _amount)),
    IAnnouncer.TimeLockOpCodes.FundTokenMove,
    false,
    address(0)
  ) {
    onlyGovernance();
    IFundKeeper(_fund).withdrawToController(_token, _amount);
    emit FundKeeperTokenMoved(_fund, _token, _amount);
  }

  // ---------------- NO TIME_LOCK --------------------------

  /// @notice Only Governance can do it. Set reward distributor address.
  ///         Distributor is a part of not critical infrastructure contracts and not require time-lock
  /// @param _distributor New distributor address
  function setDistributor(address _distributor) external {
    onlyGovernance();
    require(_distributor != address(0));
    _setDistributor(_distributor);
    emit DistributorChanged(_distributor);
  }

  /// @notice Only Governance can do it. Add/Remove Reward Distributor address
  /// @param _newRewardDistribution Reward Distributor's addresses
  /// @param _flag Reward Distributor's flags - true active, false deactivated
  function setRewardDistribution(address[] calldata _newRewardDistribution, bool _flag) external {
    onlyGovernance();
    for (uint256 i = 0; i < _newRewardDistribution.length; i++) {
      rewardDistribution[_newRewardDistribution[i]] = _flag;
    }
  }

  /// @notice Only Governance can do it. Allow given addresses claim rewards without any penalty
  function setPureRewardConsumers(address[] calldata _targets, bool _flag) external {
    onlyGovernance();
    for (uint256 i = 0; i < _targets.length; i++) {
      pureRewardConsumers[_targets[i]] = _flag;
    }
  }

  /// @notice Only Governance can do it. Add HardWorker address.
  /// @param _worker New HardWorker address
  function addHardWorker(address _worker) external {
    onlyGovernance();
    require(_worker != address(0));
    hardWorkers[_worker] = true;
    emit HardWorkerAdded(_worker);
  }

  /// @notice Only Governance can do it. Remove HardWorker address.
  /// @param _worker Exist HardWorker address
  function removeHardWorker(address _worker) external {
    onlyGovernance();
    require(_worker != address(0));
    hardWorkers[_worker] = false;
    emit HardWorkerRemoved(_worker);
  }

  /// @notice Only Governance or DAO can do it. Add to whitelist an array of addresses
  /// @param _targets An array of contracts
  function changeWhiteListStatus(address[] calldata _targets, bool status) external override {
    onlyGovernanceOrDao();
    for (uint256 i = 0; i < _targets.length; i++) {
      whiteList[_targets[i]] = status;
      emit WhiteListStatusChanged(_targets[i], status);
    }
  }

  /// @notice Only Governance can do it. Register pairs Vault/Strategy
  /// @param _vaults Vault addresses
  /// @param _strategies Strategy addresses
  function addVaultsAndStrategies(address[] memory _vaults, address[] memory _strategies) external override {
    onlyGovernance();
    require(_vaults.length == _strategies.length, "arrays wrong length");
    for (uint256 i = 0; i < _vaults.length; i++) {
      _addVaultAndStrategy(_vaults[i], _strategies[i]);
    }
  }

  /// @notice Only Governance can do it. Register a pair Vault/Strategy
  /// @param _vault Vault addresses
  /// @param _strategy Strategy addresses
  function _addVaultAndStrategy(address _vault, address _strategy) private {
    require(_vault != address(0), "new vault shouldn't be empty");
    require(!vaults[_vault], "vault already exists");
    require(!strategies[_strategy], "strategy already exists");
    require(_strategy != address(0), "new strategy must not be empty");
    require(IControllable(_vault).isController(address(this)));

    vaults[_vault] = true;
    IBookkeeper(_bookkeeper()).addVault(_vault);

    // adding happens while setting
    _setVaultStrategy(_vault, _strategy);
    emit VaultAndStrategyAdded(_vault, _strategy);
  }

  /// @notice Only Vault can do it. Register Strategy. Vault call it when gov set a strategy
  /// @param _strategy Strategy addresses
  function addStrategy(address _strategy) external override {
    require(vaults[msg.sender], "C: Not vault");
    if (!strategies[_strategy]) {
      strategies[_strategy] = true;
      IBookkeeper(_bookkeeper()).addStrategy(_strategy);
    }
  }

  /// @notice Only Governance or HardWorker can do it. Call doHardWork from given Vault
  /// @param _vault Vault addresses
  function doHardWork(address _vault) external {
    require(hardWorkers[msg.sender] || isGovernance(msg.sender), "C: Not hardworker or governance");
    require(vaults[_vault], "C: Not vault");
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

  // ***************** EXTERNAL *******************************

  /// @notice Return true if the given address is DAO
  /// @param _adr Address for check
  /// @return true if it is a DAO address
  function isDao(address _adr) external view override returns (bool) {
    return _dao() == _adr;
  }

  /// @notice Return true if the given address is a HardWorker or Governance
  /// @param _adr Address for check
  /// @return true if it is a HardWorker or Governance
  function isHardWorker(address _adr) external override view returns (bool) {
    return hardWorkers[_adr] || _governance() == _adr;
  }

  /// @notice Return true if the given address is a Reward Distributor or Governance or Strategy
  /// @param _adr Address for check
  /// @return true if it is a Reward Distributor or Governance or Strategy
  function isRewardDistributor(address _adr) external override view returns (bool) {
    return rewardDistribution[_adr] || _governance() == _adr || strategies[_adr];
  }

  /// @notice Return true if the given address is allowed for claim rewards without penalties
  function isPoorRewardConsumer(address _adr) external override view returns (bool) {
    return pureRewardConsumers[_adr];
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
    || _governance() == _adr
    || hardWorkers[_adr]
    || rewardDistribution[_adr]
    || pureRewardConsumers[_adr]
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
  function isValidVault(address _vault) external override view returns (bool) {
    return vaults[_vault];
  }

  /// @notice Return true if the given address is registered strategy
  /// @param _strategy Address for check
  /// @return true if it is a registered strategy
  function isValidStrategy(address _strategy) external override view returns (bool) {
    return strategies[_strategy];
  }
}
