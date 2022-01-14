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
import "../interface/IStrategySplitter.sol";

/// @title Proxy solution for connection a vault with multiple strategies
/// @dev Should be used with TetuProxyControlled.sol
/// @author belbix
contract StrategySplitter is Controllable, IStrategy, StrategySplitterStorage, IStrategySplitter {
  using SafeERC20 for IERC20;
  using ArrayLib for address[];

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "StrategySplitter";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  uint internal constant _PRECISION = 1e18;
  uint public constant STRATEGY_RATIO_DENOMINATOR = 100;
  uint public constant WITHDRAW_REQUEST_TIMEOUT = 1 hours;

  address[] public override strategies;
  mapping(address => uint) public override strategiesRatios;
  mapping(address => uint) public override withdrawRequestsCalls;

  // ***************** EVENTS ********************
  event StrategyAdded(address strategy);
  event StrategyRemoved(address strategy);
  event StrategyRatioChanged(address strategy, uint ratio);
  event RequestWithdraw(address user, uint amount, uint time);
  event Salvage(address recipient, address token, uint256 amount);
  event RebalanceAll(uint underlyingBalance, uint strategiesBalancesSum);
  event Rebalance(address strategy);

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

  // ******************** MODIFIERS ****************************

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

  // ******************** SPLITTER SPECIFIC LOGIC ****************************

  /// @dev Add new managed strategy. Should be an uniq address.
  ///      Strategy should have the same underlying with current contract.
  ///      The new strategy will have zero rate. Need to setup correct rate later.
  function addStrategy(address _strategy) external override onlyController {
    require(IStrategy(_strategy).underlying() == _underlying(), "SS: Wrong underlying");
    strategies.addUnique(_strategy);
    emit StrategyAdded(_strategy);
  }

  /// @dev Remove given strategy, reset the ratio and withdraw all underlying to this contract
  function removeStrategy(address _strategy) external override onlyControllerOrGovernance {
    strategies.findAndRemove(_strategy, true);
    strategiesRatios[_strategy] = 0;
    IERC20(_underlying()).safeApprove(_strategy, 0);
    IStrategy(_strategy).withdrawAllToVault();
    emit StrategyRemoved(_strategy);
  }

  function setStrategyRatios(address[] memory _strategies, uint[] memory _ratios) external override hardWorkers {
    require(_strategies.length == strategies.length, "SS: Wrong input strategies");
    require(_strategies.length == _ratios.length, "SS: Wrong input arrays");
    uint sum;
    for (uint i; i < _strategies.length; i++) {
      bool exist = false;
      for (uint j; j < strategies.length; j++) {
        if (strategies[j] == _strategies[i]) {
          exist = true;
          break;
        }
      }
      require(exist, "SS: Strategy not exist");
      sum += _ratios[i];
      strategiesRatios[_strategies[i]] = _ratios[i];
      emit StrategyRatioChanged(_strategies[i], _ratios[i]);
    }
    require(sum == STRATEGY_RATIO_DENOMINATOR, "SS: Wrong sum");

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
        uint strategyBalance = strategy.investedUnderlyingBalance();
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

  /// @dev User may indicate that he wants to withdraw given amount
  ///      We will try to transfer given amount to this contract in a separate transaction
  function requestWithdraw(uint _amount) external {
    uint lastRequest = withdrawRequestsCalls[msg.sender];
    if (lastRequest != 0) {
      // anti-spam protection
      require(lastRequest + WITHDRAW_REQUEST_TIMEOUT < block.timestamp, "SS: Request timeout");
    }
    uint want = _wantToWithdraw() + _amount;
    require(want <= _investedUnderlyingBalance(), "SS: You want too much");
    _setWantToWithdraw(want);

    // as protection against spamming do something useful and expensive
    // rebalance a strategy with biggest ratio
    _rebalance(strategies[strategies.length - 1]);
    withdrawRequestsCalls[msg.sender] = block.timestamp;
    emit RequestWithdraw(msg.sender, _amount, block.timestamp);
  }

  /// @dev Try to withdraw requested amount from eligible strategy.
  ///      In case of big request should be called multiple time
  function processWithdrawRequests() external hardWorkers {
    uint balance = IERC20(_underlying()).balanceOf(address(this));
    uint want = _wantToWithdraw();
    if (balance >= want) {
      // already have enough balance
      _setWantToWithdraw(0);
      return;
    }
    uint fullBalance = _investedUnderlyingBalance();
    if (want > fullBalance) {
      // we should not want to withdraw more than we have
      want = fullBalance;
    }

    want = want - balance;
    for (uint i = strategies.length; i > 0; i--) {
      IStrategy _strategy = IStrategy(strategies[i - 1]);
      uint strategyBalance = _strategy.investedUnderlyingBalance();
      if (strategyBalance == 0) {
        // suppose we withdrew all in previous calls
        continue;
      }
      if (strategyBalance <= want) {
        _strategy.withdrawToVault(want);
      } else {
        // we don't have enough amount in this strategy
        // withdraw all and call this function again
        _strategy.withdrawAllToVault();
      }
    }

    // update want to withdraw
    balance = IERC20(_underlying()).balanceOf(address(this));
    if (balance >= want) {
      _setWantToWithdraw(0);
    } else {
      _setWantToWithdraw(want - balance);
    }
  }

  function salvage(address recipient, address token, uint256 amount) external override onlyController {
    // To make sure that governance cannot come in and take away the coins
    for (uint i = 0; i < strategies.length; i++) {
      require(!IStrategy(strategies[i]).unsalvageableTokens(token), "SS: Not salvageable");
    }
    IERC20(token).safeTransfer(recipient, amount);
    emit Salvage(recipient, token, amount);
  }

  /// @dev Expensive call, probably will need to call each strategy in separated txs
  function doHardWork() external override hardWorkers {
    for (uint i = 0; i < strategies.length; i++) {
      IStrategy(strategies[i]).doHardWork();
    }
  }

  /// @dev Don't invest for keeping tx cost cheap
  ///      Need to call rebalance after this
  function investAllUnderlying() external override hardWorkers {
    _setNeedRebalance(1);
  }

  /// @dev Rebalance all strategies in one tx
  ///      Require a lot of gas and should be used carefully
  ///      In case of huge gas cost use rebalance for each strategy separately
  function rebalanceAll() external hardWorkers {
    _setNeedRebalance(0);
    // collect balances sum
    uint _underlyingBalance = IERC20(_underlying()).balanceOf(address(this));
    uint _strategiesBalancesSum = _underlyingBalance;
    for (uint i = 0; i < strategies.length; i++) {
      _strategiesBalancesSum += IStrategy(strategies[i]).investedUnderlyingBalance();
    }
    // rebalance only strategies requires withdraw
    // it will move necessary amount to this contract
    for (uint i = 0; i < strategies.length; i++) {
      uint _ratio = strategiesRatios[strategies[i]] * _PRECISION;
      if (_ratio == 0) {
        continue;
      }
      uint _strategyBalance = IStrategy(strategies[i]).investedUnderlyingBalance();
      uint _currentRatio = _strategyBalance * _PRECISION / _strategiesBalancesSum;
      if (_currentRatio < _ratio) {
        _rebalanceCall(strategies[i], _strategiesBalancesSum, _strategyBalance, _underlyingBalance, _ratio);
      }
    }

    // rebalance only strategies requires deposit
    for (uint i = 0; i < strategies.length; i++) {
      uint _ratio = strategiesRatios[strategies[i]] * _PRECISION;
      if (_ratio == 0) {
        continue;
      }
      uint _strategyBalance = IStrategy(strategies[i]).investedUnderlyingBalance();
      uint _currentRatio = _strategyBalance * _PRECISION / _strategiesBalancesSum;
      if (_currentRatio > _ratio) {
        _rebalanceCall(strategies[i], _strategiesBalancesSum, _strategyBalance, _underlyingBalance, _ratio);
      }
    }
    emit RebalanceAll(_underlyingBalance, _strategiesBalancesSum);
  }

  /// @dev External function for calling rebalance for exact strategy
  ///      Strategies that need withdraw action should be called first
  function rebalance(address _strategy) external hardWorkers {
    _setNeedRebalance(0);
    _rebalance(_strategy);
    emit Rebalance(_strategy);
  }

  /// @dev Deposit or withdraw from given strategy according the strategy ratio
  ///      Should be called from EAO with multiple off-chain steps
  function _rebalance(address _strategy) internal {
    // normalize ratio to 18 decimals
    uint _ratio = strategiesRatios[_strategy] * _PRECISION;
    // in case of unknown strategy will be reverted here
    require(_ratio != 0, "SS: Zero ratio strategy");
    uint _strategyBalance;
    uint _underlyingBalance = IERC20(_underlying()).balanceOf(address(this));
    uint _strategiesBalancesSum = _underlyingBalance;
    // collect strategies balances sum with some tricks for gas optimisation
    for (uint i = 0; i < strategies.length; i++) {
      uint balance = IStrategy(strategies[i]).investedUnderlyingBalance();
      if (strategies[i] == _strategy) {
        _strategyBalance = balance;
      }
      _strategiesBalancesSum += balance;
    }

    _rebalanceCall(_strategy, _strategiesBalancesSum, _strategyBalance, _underlyingBalance, _ratio);
  }

  ///@dev Deposit or withdraw from strategy
  function _rebalanceCall(
    address _strategy,
    uint _strategiesBalancesSum,
    uint _strategyBalance,
    uint _underlyingBalance,
    uint _ratio
  ) internal {
    uint _currentRatio = _strategyBalance * _PRECISION / _strategiesBalancesSum;
    if (_currentRatio > _ratio) {
      // Need to deposit to the strategy.
      // We are calling investAllUnderlying() because we anyway will spend similar gas
      // in case of withdraw, and we can't predict what will need.
      uint needToDeposit = _strategiesBalancesSum * (_currentRatio - _ratio) / (STRATEGY_RATIO_DENOMINATOR * _PRECISION);
      require(_underlyingBalance >= needToDeposit, "SS: Not enough splitter balance");
      IERC20(_underlying()).safeTransfer(_strategy, needToDeposit);
      IStrategy(_strategy).investAllUnderlying();
    } else if (_currentRatio < _ratio) {
      // withdraw from strategy excess value
      uint needToWithdraw = _strategiesBalancesSum * (_ratio - _currentRatio) / (STRATEGY_RATIO_DENOMINATOR * _PRECISION);
      require(_strategyBalance >= needToWithdraw, "SS: Not enough strat balance");
      IStrategy(_strategy).withdrawToVault(needToWithdraw);
    }
  }

  function setNeedRebalance(uint _value) external hardWorkers {
    _setNeedRebalance(_value);
  }

  function pauseInvesting() external pure override {
    revert("SS: Not supported");
  }

  function continueInvesting() external pure override {
    revert("SS: Not supported");
  }

  function transferAllUnderlyingToVault() internal {
    uint balance = IERC20(_underlying()).balanceOf(address(this));
    if (balance > 0) {
      IERC20(_underlying()).safeTransfer(_vault(), balance);
    }
  }

  // **************** VIEWS ***************

  /// @dev Return array of reward tokens collected across all strategies.
  ///      Has random sorting
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

  /// @dev Underlying token. Should be the same for all controlled strategies
  function underlying() external view override returns (address) {
    return _underlying();
  }

  /// @dev Splitter underlying balance
  function underlyingBalance() external view override returns (uint256){
    return IERC20(_underlying()).balanceOf(address(this));
  }

  /// @dev Return strategies balances. Doesn't include splitter underlying balance
  function rewardPoolBalance() external view override returns (uint256) {
    uint balance;
    for (uint i = 0; i < strategies.length; i++) {
      balance += IStrategy(strategies[i]).investedUnderlyingBalance();
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

  /// @dev Connected vault to this splitter
  function vault() external view override returns (address) {
    return _vault();
  }

  /// @dev Return a sum of all balances under control. Should be accurate - it will be used in the vault
  function investedUnderlyingBalance() external view override returns (uint256) {
    return _investedUnderlyingBalance();
  }

  function _investedUnderlyingBalance() internal view returns (uint256) {
    uint balance = IERC20(_underlying()).balanceOf(address(this));
    for (uint i = 0; i < strategies.length; i++) {
      balance += IStrategy(strategies[i]).investedUnderlyingBalance();
    }
    return balance;
  }

  /// @dev Splitter has specific hardcoded platform
  function platform() external pure override returns (Platform) {
    return Platform.STRATEGY_SPLITTER;
  }

  /// @dev Assume that we will use  this contract only for single token vaults
  function assets() external view override returns (address[] memory) {
    address[] memory result = new address[](1);
    result[0] = _underlying();
    return result;
  }

  /// @dev No pause on splitter
  function pausedInvesting() external pure override returns (bool) {
    return false;
  }

  /// @dev Return ready to claim rewards array
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

  /// @dev Return sum of strategies poolTotalAmount values
  function poolTotalAmount() external view override returns (uint256) {
    uint balance = 0;
    for (uint i = 0; i < strategies.length; i++) {
      balance += IStrategy(strategies[i]).poolTotalAmount();
    }
    return balance;
  }

  /// @dev Positive value indicate that this splitter should be rebalanced.
  function needRebalance() external view override returns (uint) {
    return _needRebalance();
  }

  /// @dev Sum of users requested values
  function wantToWithdraw() external view override returns (uint) {
    return _wantToWithdraw();
  }

  /// @dev Return maximum available balance to withdraw without calling more than 1 strategy
  function maxCheapWithdraw() external view override returns (uint) {
    uint strategyBalance;
    if (strategies.length != 0) {
      strategyBalance = IStrategy(strategies[strategies.length - 1]).investedUnderlyingBalance();
    }
    return strategyBalance
    + IERC20(_underlying()).balanceOf(address(this))
    + IERC20(_underlying()).balanceOf(_vault());
  }

  function strategiesLength() external view override returns (uint) {
    return strategies.length;
  }

  function allStrategies() external view override returns (address[] memory) {
    return strategies;
  }


}
