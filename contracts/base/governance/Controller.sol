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

pragma solidity 0.7.6;

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interface/IStrategy.sol";
import "../interface/ISmartVault.sol";
import "../interface/IFeeRewardForwarder.sol";
import "./Controllable.sol";
import "../interface/IBookkeeper.sol";
import "./ControllerStorage.sol";

contract Controller is Initializable, Controllable, ControllerStorage {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  function initialize() public initializer {
    Controllable.initializeControllable(address(this));
    ControllerStorage.initializeControllerStorage(
      msg.sender
    );

    // 100% by default
    setPSNumeratorDenominator(1000, 1000);
    // 10% by default
    setFundNumeratorDenominator(100, 1000);
  }

  // ************ EVENTS **********************

  event HardWorkerAdded(address value);
  event HardWorkerRemoved(address value);
  event AddedToWhiteList(address value);
  event RemovedFromWhiteList(address value);
  event VaultAndStrategyAdded(address vault, address strategy);
  event Salvaged(address token, uint256 amount);
  event SalvagedStrategy(address strategy, address token, uint256 amount);
  event NotifyFee(address underlying, uint256 fee);
  event SharePriceChangeLog(
    address indexed vault,
    address indexed strategy,
    uint256 oldSharePrice,
    uint256 newSharePrice,
    uint256 timestamp
  );

  // ************ VARIABLES **********************
  string public constant VERSION = "0";
  mapping(address => bool) public override whiteList;
  mapping(address => bool) public override vaults;
  mapping(address => bool) public override strategies;
  mapping(address => bool) public hardWorkers;
  mapping(address => bool) public rewardDistribution;

  modifier onlyGovernance() {
    require(isGovernance(msg.sender), "not governance");
    _;
  }

  modifier onlyGovernanceOrDao() {
    require(isGovernance(msg.sender) || isDao(msg.sender), "not governance or dao");
    _;
  }

  modifier onlyVault() {
    require(vaults[msg.sender], "only exist active vault");
    _;
  }

  modifier onlyHardWorkerOrGovernance() {
    require(IController(controller()).isHardWorker(msg.sender)
      || IController(controller()).isGovernance(msg.sender), "only hardworker");
    _;
  }

  // ************ GOVERNANCE ACTIONS **************************

  function setGovernance(address _governance) external onlyGovernance {
    require(_governance != address(0), "zero address");
    _setGovernance(_governance);
  }

  function setDao(address _dao) external onlyGovernance {
    require(_dao != address(0), "zero address");
    _setDao(_dao);
  }

  function setFeeRewardForwarder(address _feeRewardForwarder) external onlyGovernance {
    require(_feeRewardForwarder != address(0), "zero address");
    rewardDistribution[feeRewardForwarder()] = false;
    _setFeeRewardForwarder(_feeRewardForwarder);
    rewardDistribution[feeRewardForwarder()] = true;
  }

  function setBookkeeper(address _bookkeeper) external onlyGovernance {
    require(_bookkeeper != address(0), "zero address");
    _setBookkeeper(_bookkeeper);
  }

  function setMintHelper(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setMintHelper(_newValue);
  }

  function setRewardToken(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setRewardToken(_newValue);
  }

  function setFundToken(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setFundToken(_newValue);
  }

  function setNotifyHelper(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    rewardDistribution[notifyHelper()] = false;
    _setNotifyHelper(_newValue);
    rewardDistribution[notifyHelper()] = true;
  }

  function setPsVault(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setPsVault(_newValue);
  }

  function setFund(address _newValue) external onlyGovernance {
    require(_newValue != address(0), "zero address");
    _setFund(_newValue);
  }

  function setRewardDistribution(address[] calldata _newRewardDistribution, bool _flag) external onlyGovernance {
    for (uint256 i = 0; i < _newRewardDistribution.length; i++) {
      rewardDistribution[_newRewardDistribution[i]] = _flag;
    }
  }

  function setPSNumeratorDenominator(uint256 numerator, uint256 denominator) public onlyGovernanceOrDao {
    require(numerator <= denominator, "invalid values");
    require(denominator != 0, "cannot divide by 0");
    _setPsNumerator(numerator);
    _setPsDenominator(denominator);
  }

  function setFundNumeratorDenominator(uint256 numerator, uint256 denominator) public onlyGovernanceOrDao {
    require(numerator <= denominator, "invalid values");
    require(denominator != 0, "cannot divide by 0");
    _setFundNumerator(numerator);
    _setFundDenominator(denominator);
  }


  function addHardWorker(address _worker) external onlyGovernance {
    require(_worker != address(0), "_worker must be defined");
    hardWorkers[_worker] = true;
    emit HardWorkerAdded(_worker);
  }

  function removeHardWorker(address _worker) external onlyGovernance {
    require(_worker != address(0), "_worker must be defined");
    hardWorkers[_worker] = false;
    emit HardWorkerRemoved(_worker);
  }

  function addToWhiteListMulti(address[] calldata _targets) external onlyGovernanceOrDao {
    for (uint256 i = 0; i < _targets.length; i++) {
      addToWhiteList(_targets[i]);
    }
  }

  function addToWhiteList(address _target) public onlyGovernanceOrDao {
    whiteList[_target] = true;
    emit AddedToWhiteList(_target);
  }

  function removeFromWhiteListMulti(address[] calldata _targets) external onlyGovernanceOrDao {
    for (uint256 i = 0; i < _targets.length; i++) {
      removeFromWhiteList(_targets[i]);
    }
  }

  function removeFromWhiteList(address _target) public onlyGovernanceOrDao {
    whiteList[_target] = false;
    emit RemovedFromWhiteList(_target);
  }

  function changeVaultsStatuses(address[] calldata _targets, bool[] calldata _statuses) external onlyGovernance {
    require(_targets.length == _statuses.length, "wrong arrays");
    for (uint256 i = 0; i < _targets.length; i++) {
      ISmartVault(_targets[i]).changeActivityStatus(_statuses[i]);
    }
  }

  function addVaultsAndStrategies(address[] memory _vaults, address[] memory _strategies) external onlyGovernance {
    require(_vaults.length == _strategies.length, "arrays wrong length");
    for (uint256 i = 0; i < _vaults.length; i++) {
      addVaultAndStrategy(_vaults[i], _strategies[i]);
    }
  }

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

  function addStrategy(address _strategy) public override onlyVault {
    if (strategies[_strategy] == false) {
      strategies[_strategy] = true;
      IBookkeeper(bookkeeper()).addStrategy(_strategy);
    }
  }

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

  // transfers token from the controller contract to the governance
  function salvage(address _token, uint256 _amount) external onlyGovernance {
    IERC20(_token).safeTransfer(governance(), _amount);
    emit Salvaged(_token, _amount);
  }

  function salvageStrategy(address _strategy, address _token, uint256 _amount) external onlyGovernance {
    // the strategy is responsible for maintaining the list of
    // salvagable tokens, to make sure that governance cannot come
    // in and take away the coins
    IStrategy(_strategy).salvage(governance(), _token, _amount);
    emit SalvagedStrategy(_strategy, _token, _amount);
  }

  // ***************** EXTERNAL *******************************

  function isGovernance(address _adr) public view override returns (bool) {
    return governance() == _adr;
  }

  function isDao(address _adr) public view override returns (bool) {
    return dao() == _adr;
  }

  function isHardWorker(address _adr) public override view returns (bool) {
    return hardWorkers[_adr] || isGovernance(_adr);
  }

  function isRewardDistributor(address _adr) public override view returns (bool) {
    return rewardDistribution[_adr] || isGovernance(_adr) || isValidStrategy(_adr);
  }

  function isAllowedUser(address _adr) external view override returns (bool) {
    return isNotSmartContract(_adr)
    || whiteList[_adr]
    || isGovernance(_adr)
    || isHardWorker(_adr)
    || isRewardDistributor(_adr)
    || vaults[_adr]
    || strategies[_adr];
  }

  // it is not 100% guarantee after EIP-3074 implementation
  // use it as an additional check
  function isNotSmartContract(address _adr) private view returns (bool) {
    return _adr == tx.origin;
  }

  function isValidVault(address _vault) public override view returns (bool) {
    return vaults[_vault];
  }

  function isValidStrategy(address _strategy) public override view returns (bool) {
    return strategies[_strategy];
  }
}
