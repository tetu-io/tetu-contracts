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
import "../interface/IStrategy.sol";
import "../governance/Controllable.sol";
import "../interface/ISmartVault.sol";
import "./StrategySplitterStorage.sol";
import "../ArrayLib.sol";

/// @title Proxy solution for connection a vault with multiple strategies
/// @dev Should be used with TetuProxyControlled.sol
/// @author belbix
contract StrategySplitter is Controllable, IStrategy, StrategySplitterStorage {
  using SafeERC20 for IERC20;
  using ArrayLib for address[];

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "StrategySplitter";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  uint public constant STRATEGY_RATIO_DENOMINATOR = 100;

  address[] public strategies;
  mapping(address => uint) public strategiesRatios;

  // ***************** EVENTS ********************
  event StrategyAdded(address strategy);
  event StrategyRemoved(address strategy);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  ///      Initialize Controllable with sender address
  function initialize(
    address _controller,
    address _underlying,
    address __vault
  ) external initializer {
    Controllable.initializeControllable(_controller);
    _setUnderlying(_underlying);
    _setVault(__vault);
  }

  /// @dev Only for linked Vault or Governance/Controller.
  ///      Use for functions that should have strict access.
  modifier restricted() {
    require(msg.sender == _vault()
    || msg.sender == address(controller())
      || isGovernance(msg.sender),
      "SS: Not Gov or Vault");
    _;
  }

  /// @dev Extended strict access with including HardWorkers addresses
  ///      Use for functions that should be called by HardWorkers
  modifier hardWorkers() {
    require(msg.sender == _vault()
    || msg.sender == address(controller())
    || IController(controller()).isHardWorker(msg.sender)
      || isGovernance(msg.sender),
      "SS: Not HW or Gov or Vault");
    _;
  }

  /// @dev Add new managed strategy. Should be uniq address.
  ///      The new strategy will have zero rate. Need to setup correct rate later.
  function addStrategy(address _strategy) external onlyControllerOrGovernance {
    strategies.addUnique(_strategy);
    emit StrategyAdded(_strategy);
  }

  /// @dev Remove given strategy, reset the ratio and withdraw all underlying to this contract
  function removeStrategy(address _strategy) external onlyControllerOrGovernance {
    strategies.findAndRemove(_strategy, true);
    strategiesRatios[_strategy] = 0;
    IERC20(_underlying()).safeApprove(_strategy, 0);
    IStrategy(_strategy).withdrawAllToVault();
    emit StrategyRemoved(_strategy);
  }

  function setStrategyRatios(address[] memory _strategies, uint[] memory _ratios) external hardWorkers {
    require(_strategies.length == _ratios.length, "SS: Wrong input");
    uint sum;
    for (uint i; i < _strategies.length; i++) {
      sum += _ratios[i];
      strategiesRatios[_strategies[i]] = _ratios[i];
    }
    require(sum == STRATEGY_RATIO_DENOMINATOR, "SS: Wrong sum");
    _setStrategiesRatioSum(sum);

    // sorting strategies by ratios
    _sortStrategies();
  }

  /// @dev Insertion sorting algorithm for using with arrays fewer than 10 elements
  ///      Based on https://medium.com/coinmonks/sorting-in-solidity-without-comparison-4eb47e04ff0d
  function _sortStrategies() internal {
    uint length = strategies.length;
    for (uint i = 1; i < length; i++) {
      uint key = strategiesRatios[strategies[i]];
      uint j = i - 1;
      while ((int(j) >= 0) && (strategiesRatios[strategies[j]] > key)) {
        strategies[j + 1] = strategies[j];
        j--;
      }
      strategies[j + 1] = strategies[i];
    }
  }

  // *************** STRATEGY GOVERNANCE ACTIONS **************

  /// @dev Try to withdraw all from all strategies. May be too expensive to handle in one tx
  function withdrawAllToVault() external override hardWorkers {
    for (uint i = 0; i < strategies.length; i++) {
      IStrategy(strategies[i]).withdrawAllToVault();
    }
    transferAllUnderlyingToVault();
  }

  /// @dev Try to emergency withdraw all from all strategies. May be too expensive to handle in one tx
  ///      In case of out of gas should be processed for each strategy manually
  function emergencyExit() external override restricted {
    for (uint i = 0; i < strategies.length; i++) {
      IStrategy(strategies[i]).emergencyExit();
    }
    transferAllUnderlyingToVault();
  }

  /// @dev Cascade withdraw from strategies start from with higher ratio until reach the target amount.
  ///      For large amounts with multiple strategies may not be possible to process this function.
  function withdrawToVault(uint256 amount) external override hardWorkers {
    uint uBalance = IERC20(_underlying()).balanceOf(address(this));
    if (uBalance < amount) {
      for (uint i = strategies.length; i > 0; i--) {
        IStrategy strategy = IStrategy(strategies[i - 1]);
        uint strategyBalance = strategy.underlyingBalance();
        if (strategyBalance <= amount) {
          strategy.withdrawAllToVault();
        } else {
          strategy.withdrawToVault(amount);
        }
        uBalance = IERC20(_underlying()).balanceOf(address(this));
        if (uBalance >= amount) {
          break;
        }
      }
    }
    transferAllUnderlyingToVault();
  }

  function requestWithdraw(uint _amount) external {
    // todo
  }

  function processWithdrawRequests() external hardWorkers {
    // todo
  }

  function salvage(address recipient, address token, uint256 amount) external override onlyController {
    // To make sure that governance cannot come in and take away the coins
    for (uint i = 0; i < strategies.length; i++) {
      require(!IStrategy(strategies[i]).unsalvageableTokens(token), "SS: Not salvageable");
    }
    IERC20(token).safeTransfer(recipient, amount);
  }

  function doHardWork() external override hardWorkers {
    for (uint i = 0; i < strategies.length; i++) {
      IStrategy(strategies[i]).doHardWork();
    }
  }

  /// @dev Invest all underlying to strategy with highest ratio
  ///      Need to call rebalance after this
  function investAllUnderlying() external override hardWorkers {
    uint balance = IERC20(_underlying()).balanceOf(address(this));
    if (balance == 0) {
      return;
    }
    IERC20(_underlying()).safeTransfer(strategies[strategies.length - 1], balance);
    IStrategy(strategies[strategies.length - 1]).investAllUnderlying();
  }

  function rebalance(address _strategy, uint _strategiesBalancesSum) external hardWorkers {
    uint ratio = strategiesRatios[_strategy];
    // in case of unknown strategy will be reverted here
    require(ratio != 0, "SS: Zero ratio strategy");
    IStrategy strategy = IStrategy(_strategy);
    strategy.underlyingBalance();
  }

  function pauseInvesting() external override restricted {
    revert("SS: Not supported");
  }

  function continueInvesting() external override restricted {
    revert("SS: Not supported");
  }

  function transferAllUnderlyingToVault() internal {
    uint balance = IERC20(_underlying()).balanceOf(address(this));
    if (balance > 0) {
      IERC20(_underlying()).safeTransfer(_vault(), balance);
    }
  }

  // **************** VIEWS ***************
  function rewardTokens() external view override returns (address[] memory) {
    return _rewardTokens();
  }

  function _rewardTokens() internal view returns (address[] memory) {
    address[] memory rts = new address[](20);
    uint size = 0;
    for (uint i = 0; i < strategies.length; i++) {
      address[] memory strategyRts = IStrategy(strategies[i]).rewardTokens();
      for (uint j = 0; j < strategyRts.length; j++) {
        address rt = strategyRts[j];
        bool exist = false;
        for (uint k = 0; k < rts.length; k++) {
          if (rts[k] == rt) {
            exist = true;
            break;
          }
        }
        if (!exist) {
          rts[size] = rt;
          size++;
        }
      }
    }
    address[] memory result = new address[](size);
    for (uint i = 0; i < size; i++) {
      result[i] = rts[i];
    }
    return result;
  }

  function underlying() external view override returns (address) {
    return _underlying();
  }

  function underlyingBalance() external view override returns (uint256){
    uint balance = IERC20(_underlying()).balanceOf(address(this));
    for (uint i = 0; i < strategies.length; i++) {
      balance += IStrategy(strategies[i]).underlyingBalance();
    }
    return balance;
  }

  function rewardPoolBalance() external view override returns (uint256) {
    uint balance = 0;
    for (uint i = 0; i < strategies.length; i++) {
      balance += IStrategy(strategies[i]).rewardPoolBalance();
    }
    return balance;
  }

  /// @dev Return average buyback ratio
  function buyBackRatio() external view override returns (uint256) {
    uint bbRatio = 0;
    for (uint i = 0; i < strategies.length; i++) {
      bbRatio += IStrategy(strategies[i]).buyBackRatio();
    }
    bbRatio = bbRatio / strategies.length;
    return bbRatio;
  }

  function unsalvageableTokens(address token) external view override returns (bool) {
    for (uint i = 0; i < strategies.length; i++) {
      if (IStrategy(strategies[i]).unsalvageableTokens(token)) {
        return true;
      }
    }
    return false;
  }

  function vault() external view override returns (address) {
    return _vault();
  }

  function investedUnderlyingBalance() external view override returns (uint256) {
    uint balance = 0;
    for (uint i = 0; i < strategies.length; i++) {
      balance += IStrategy(strategies[i]).investedUnderlyingBalance();
    }
    return balance;
  }

  function platform() external view override returns (Platform) {
    return Platform.STRATEGY_SPLITTER;
  }

  /// @dev Assume that we will use  this contract only for single token vaults
  function assets() external view override returns (address[] memory) {
    address[] memory result = new address[](1);
    result[0] = _underlying();
    return result;
  }

  /// @dev No pause on splitter
  function pausedInvesting() external view override returns (bool) {
    return false;
  }

  function readyToClaim() external view override returns (uint256[] memory) {
    uint[] memory rewards = new uint[](20);
    address[] memory rts = new address[](20);
    uint size = 0;
    for (uint i = 0; i < strategies.length; i++) {
      address[] memory strategyRts = IStrategy(strategies[i]).rewardTokens();
      uint[] memory strategyReadyToClaim = IStrategy(strategies[i]).readyToClaim();
      // don't count, better to skip than ruin
      if (strategyRts.length != strategyReadyToClaim.length) {
        continue;
      }
      for (uint j = 0; j < strategyRts.length; j++) {
        address rt = strategyRts[j];
        bool exist = false;
        for (uint k = 0; k < rts.length; k++) {
          if (rts[k] == rt) {
            exist = true;
            rewards[k] += strategyReadyToClaim[j];
            break;
          }
        }
        if (!exist) {
          rts[size] = rt;
          rewards[size] = strategyReadyToClaim[j];
          size++;
        }
      }
    }
    uint[] memory result = new uint[](size);
    for (uint i = 0; i < size; i++) {
      result[i] = rewards[i];
    }
    return result;
  }

  function poolTotalAmount() external view override returns (uint256) {
    uint balance = 0;
    for (uint i = 0; i < strategies.length; i++) {
      balance += IStrategy(strategies[i]).poolTotalAmount();
    }
    return balance;
  }


}
