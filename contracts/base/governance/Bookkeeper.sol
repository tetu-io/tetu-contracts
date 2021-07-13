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
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "../interface/IBookkeeper.sol";
import "./Controllable.sol";
import "../interface/IGovernable.sol";

contract Bookkeeper is IBookkeeper, Initializable, Controllable, IGovernable {
  using SafeMathUpgradeable for uint256;

  string public constant VERSION = "0";

  // DO NOT CHANGE NAMES OR ORDERING!
  address[] private _vaults;
  address[] private _strategies;
  mapping(address => uint256) public override targetTokenEarned;
  mapping(address => HardWork) private _lastHardWork;
  mapping(address => mapping(address => uint256)) public vaultUsersBalances;
  mapping(address => mapping(address => mapping(address => uint256))) public userEarned;
  mapping(address => uint256) public override vaultUsersQuantity;
  mapping(address => PpfsChange) private _lastPpfsChange;

  event RegisterVault(address value);
  event RegisterStrategy(address value);
  event RegisterStrategyEarned(address strategy, uint256 amount);
  event RegisterUserAction(address user, uint256 amount, bool deposit);
  event RegisterUserEarned(address user, address vault, address token, uint256 amount);
  event RegisterPpfsChange(address vault, uint256 oldValue, uint256 newValue);

  function initialize(address _controller) public initializer {
    Controllable.initializeControllable(_controller);
  }

  modifier onlyStrategy() {
    require(IController(controller()).strategies(msg.sender), "only exist strategy");
    _;
  }

  modifier onlyFeeRewardForwarder() {
    require(IController(controller()).feeRewardForwarder() == msg.sender, "only exist forwarder");
    _;
  }

  modifier onlyVault() {
    require(IController(controller()).vaults(msg.sender), "only exist vault");
    _;
  }

  modifier onlyController() {
    require(controller() == msg.sender, "not controller");
    _;
  }

  // manually we should add a pair vault / strategy for keep both array in the same state
  function addVaultAndStrategy(address _vault, address _strategy) external onlyControllerOrGovernance {
    if (!isVaultExist(_vault)) {
      _vaults.push(_vault);
      emit RegisterVault(_vault);
    }

    if (!isStrategyExist(_strategy)) {
      _strategies.push(_strategy);
      emit RegisterStrategy(_strategy);
    }
  }

  function addVault(address _vault) external override onlyController {
    if (!isVaultExist(_vault)) {
      _vaults.push(_vault);
      emit RegisterVault(_vault);
    }
  }

  function addStrategy(address _strategy) external override onlyController {
    if (!isStrategyExist(_strategy)) {
      _strategies.push(_strategy);
      emit RegisterStrategy(_strategy);
    }
  }

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

  function registerPpfsChange(address vault, uint256 value)
  external override onlyFeeRewardForwarder {
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

  function registerUserAction(address _user, uint256 _amount, bool _deposit)
  external override onlyVault {
    if (vaultUsersBalances[msg.sender][_user] == 0) {
      vaultUsersQuantity[msg.sender] = vaultUsersQuantity[msg.sender].add(1);
    }
    if (_deposit) {
      vaultUsersBalances[msg.sender][_user] = vaultUsersBalances[msg.sender][_user].add(_amount);
    } else {
      vaultUsersBalances[msg.sender][_user] = vaultUsersBalances[msg.sender][_user].sub(_amount);
    }
    if (vaultUsersBalances[msg.sender][_user] == 0) {
      vaultUsersQuantity[msg.sender] = vaultUsersQuantity[msg.sender].sub(1);
    }
    emit RegisterUserAction(_user, _amount, _deposit);
  }

  function registerUserEarned(address _user, address _vault, address _rt, uint256 _amount)
  external override onlyVault {
    userEarned[_user][_vault][_rt] = userEarned[_user][_vault][_rt].add(_amount);
    emit RegisterUserEarned(_user, _vault, _rt, _amount);
  }

  function isGovernance(address _contract) external override view returns (bool) {
    return IController(controller()).isGovernance(_contract);
  }

  function vaults() external override view returns (address[] memory) {
    return _vaults;
  }

  function strategies() external override view returns (address[] memory) {
    return _strategies;
  }

  function lastHardWork(address vault) public view override returns (HardWork memory) {
    return _lastHardWork[vault];
  }

  function lastPpfsChange(address vault) public view override returns (PpfsChange memory) {
    return _lastPpfsChange[vault];
  }

  function isVaultExist(address _value) internal view returns (bool) {
    for (uint256 i = 0; i < _vaults.length; i++) {
      if (_vaults[i] == _value) {
        return true;
      }
    }
    return false;
  }

  function isStrategyExist(address _value) internal view returns (bool) {
    for (uint256 i = 0; i < _strategies.length; i++) {
      if (_strategies[i] == _value) {
        return true;
      }
    }
    return false;
  }

  function removeFromVaults(uint256 index) external onlyControllerOrGovernance {
    require(index < _vaults.length, "wrong index");

    for (uint256 i = index; i < _vaults.length - 1; i++) {
      _vaults[i] = _vaults[i + 1];
    }
    _vaults.pop();
  }

  function removeFromStrategies(uint256 index) external onlyControllerOrGovernance {
    require(index < _strategies.length, "wrong index");

    for (uint256 i = index; i < _strategies.length - 1; i++) {
      _strategies[i] = _strategies[i + 1];
    }
    _strategies.pop();
  }

}
