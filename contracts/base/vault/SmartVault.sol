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

import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import "../interface/IStrategy.sol";
import "../interface/IController.sol";
import "../interface/IVaultController.sol";
import "./VaultStorage.sol";
import "../governance/Controllable.sol";
import "../interface/IBookkeeper.sol";

/// @title Smart Vault is a combination of implementations drawn from Synthetix pool
///        for their innovative reward vesting and Yearn vault for their share price model
/// @dev Use with TetuProxy
/// @author belbix
contract SmartVault is Initializable, ERC20Upgradeable, VaultStorage, Controllable {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;

  // ************* CONSTANTS ********************
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.9.0";
  /// @dev Denominator for penalty numerator
  uint256 public constant LOCK_PENALTY_DENOMINATOR = 1000;
  uint256 public constant TO_INVEST_DENOMINATOR = 1000;
  uint256 public constant DEPOSIT_FEE_DENOMINATOR = 10000;
  uint256 private constant NAME_OVERRIDE_ID = 0;
  uint256 private constant SYMBOL_OVERRIDE_ID = 1;

  // ********************* VARIABLES *****************
  //in upgradable contracts you can skip storage ONLY for mapping and dynamically-sized array types
  //https://docs.soliditylang.org/en/v0.4.21/miscellaneous.html#layout-of-state-variables-in-storage
  //use VaultStorage for primitive variables

  // ****** REWARD MECHANIC VARIABLES ******** //
  /// @dev A list of reward tokens that able to be distributed to this contract
  address[] internal _rewardTokens;
  /// @dev Timestamp value when current period of rewards will be ended
  mapping(address => uint256) public override periodFinishForToken;
  /// @dev Reward rate in normal circumstances is distributed rewards divided on duration
  mapping(address => uint256) public override rewardRateForToken;
  /// @dev Last rewards snapshot time. Updated on each share movements
  mapping(address => uint256) public override lastUpdateTimeForToken;
  /// @dev Rewards snapshot calculated from rewardPerToken(rt). Updated on each share movements
  mapping(address => uint256) public override rewardPerTokenStoredForToken;
  /// @dev User personal reward rate snapshot. Updated on each share movements
  mapping(address => mapping(address => uint256)) public override userRewardPerTokenPaidForToken;
  /// @dev User personal earned reward snapshot. Updated on each share movements
  mapping(address => mapping(address => uint256)) public override rewardsForToken;

  // ******** OTHER VARIABLES **************** //
  /// @dev Only for statistical purposes, no guarantee to be accurate
  ///      Last timestamp value when user withdraw. Resets on transfer
  mapping(address => uint256) public override userLastWithdrawTs;
  /// @dev In normal circumstances hold last claim timestamp for users
  mapping(address => uint256) public override userBoostTs;
  /// @dev In normal circumstances hold last withdraw timestamp for users
  mapping(address => uint256) public override userLockTs;
  /// @dev Only for statistical purposes, no guarantee to be accurate
  ///      Last timestamp value when user deposit. Doesn't update on transfers
  mapping(address => uint256) public override userLastDepositTs;
  /// @dev VaultStorage doesn't have a map for strings so we need to add it here
  mapping(uint256 => string) private _nameOverrides;

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _name ERC20 name
  /// @param _symbol ERC20 symbol
  /// @param _controller Controller address
  /// @param _underlying Vault underlying address
  /// @param _duration Rewards duration
  /// @param _lockAllowed Set true with lock mechanic requires
  /// @param _rewardToken Reward token address. Set zero address if not requires
  function initializeSmartVault(
    string memory _name,
    string memory _symbol,
    address _controller,
    address _underlying,
    uint256 _duration,
    bool _lockAllowed,
    address _rewardToken,
    uint _depositFee
  ) external initializer {
    __ERC20_init(_name, _symbol);

    Controllable.initializeControllable(_controller);
    VaultStorage.initializeVaultStorage(
      _underlying,
      _duration,
      _lockAllowed
    );
    // initialize reward token for easily deploy new vaults from deployer address
    if (_rewardToken != address(0)) {
      require(_rewardToken != underlying());
      _rewardTokens.push(_rewardToken);
    }
    // set 100% to invest
    _setToInvest(TO_INVEST_DENOMINATOR);
    // set deposit fee
    if (_depositFee > 0) {
      require(_depositFee <= DEPOSIT_FEE_DENOMINATOR / 100);
      _setDepositFeeNumerator(_depositFee);
    }
  }

  // *************** EVENTS ***************************
  event Withdraw(address indexed beneficiary, uint256 amount);
  event Deposit(address indexed beneficiary, uint256 amount);
  event Invest(uint256 amount);
  event StrategyAnnounced(address newStrategy, uint256 time);
  event StrategyChanged(address newStrategy, address oldStrategy);
  event RewardAdded(address rewardToken, uint256 reward);
  event RewardMovedToController(address rewardToken, uint256 amount);
  event Staked(address indexed user, uint256 amount);
  event Withdrawn(address indexed user, uint256 amount);
  event RewardPaid(address indexed user, address rewardToken, uint256 reward);
  event RewardDenied(address indexed user, address rewardToken, uint256 reward);
  event AddedRewardToken(address indexed token);
  event RemovedRewardToken(address indexed token);
  event RewardRecirculated(address indexed token, uint256 amount);
  event RewardSentToController(address indexed token, uint256 amount);

  // *************** RESTRICTIONS ***************************

  /// @dev Allow operation only for VaultController
  function _onlyVaultController(address _sender) private view {
    require(IController(controller()).vaultController() == _sender, "SV: Not vault controller");
  }

  /// @dev Allowed only for active strategy
  function _isActive() private view {
    require(active(), "SV: Not active");
  }

  /// @dev Only smart contracts will be affected by this restriction
  ///      If it is a contract it should be whitelisted
  function _onlyAllowedUsers(address _sender) private view {
    require(IController(controller()).isAllowedUser(_sender), "SV: Not allowed");
  }

  // ************ COMMON VIEWS ***********************

  function name() public view override returns (string memory) {
    string memory nameForOverride = _nameOverrides[NAME_OVERRIDE_ID];
    if (bytes(nameForOverride).length != 0) {
      return nameForOverride;
    }
    return super.name();
  }

  function symbol() public view override returns (string memory) {
    string memory symbolForOverride = _nameOverrides[SYMBOL_OVERRIDE_ID];
    if (bytes(symbolForOverride).length != 0) {
      return symbolForOverride;
    }
    return super.symbol();
  }

  /// @notice ERC20 compatible decimals value. Should be the same as underlying
  function decimals() public view override returns (uint8) {
    return ERC20Upgradeable(underlying()).decimals();
  }

  /// @dev Returns vault controller
  function _vaultController() internal view returns (IVaultController){
    return IVaultController(IController(controller()).vaultController());
  }

  // ************ GOVERNANCE ACTIONS ******************

  /// @notice Override vault name
  function overrideName(string calldata value) external {
    require(isGovernance(msg.sender));
    _nameOverrides[NAME_OVERRIDE_ID] = value;
  }

  /// @notice Override vault name
  function overrideSymbol(string calldata value) external {
    require(isGovernance(msg.sender));
    _nameOverrides[SYMBOL_OVERRIDE_ID] = value;
  }

  /// @notice Change permission for decreasing ppfs during hard work process
  /// @param _value true - allowed, false - disallowed
  function changePpfsDecreaseAllowed(bool _value) external override {
    _onlyVaultController(msg.sender);
    _setPpfsDecreaseAllowed(_value);
  }

  /// @notice Set lock period for funds. Can be called only once
  /// @param _value Timestamp value
  function setLockPeriod(uint256 _value) external override {
    require(isController(msg.sender) || isGovernance(msg.sender), "SV: Not controller or gov");
    require(lockAllowed());
    require(lockPeriod() == 0);
    _setLockPeriod(_value);
  }

  /// @notice Set lock initial penalty nominator. Can be called only once
  /// @param _value Penalty denominator, should be in range 0 - (LOCK_PENALTY_DENOMINATOR / 2)
  function setLockPenalty(uint256 _value) external override {
    require(isController(msg.sender) || isGovernance(msg.sender), "SV: Not controller or gov");
    require(_value <= (LOCK_PENALTY_DENOMINATOR / 2));
    require(lockAllowed());
    require(lockPenalty() == 0);
    _setLockPenalty(_value);
  }

  /// @notice Set numerator for toInvest ratio in range 0 - 1000
  function setToInvest(uint256 _value) external override {
    _onlyVaultController(msg.sender);
    require(_value <= TO_INVEST_DENOMINATOR);
    _setToInvest(_value);
  }

  // we should be able to disable lock functionality for not initialized contract
  function disableLock() external override {
    _onlyVaultController(msg.sender);
    require(lockAllowed());
    // should be not initialized
    // initialized lock forbidden to change
    require(lockPenalty() == 0);
    require(lockPeriod() == 0);
    _disableLock();
  }

  /// @notice Change the active state marker
  /// @param _active Status true - active, false - deactivated
  function changeActivityStatus(bool _active) external override {
    _onlyVaultController(msg.sender);
    _setActive(_active);
  }

  /// @notice Change the protection mode status.
  ///          Protection mode means claim rewards on withdraw and 0% initial reward boost
  /// @param _active Status true - active, false - deactivated
  function changeProtectionMode(bool _active) external override {
    require(isGovernance(msg.sender), "SV: Not governance");
    _setProtectionMode(_active);
  }

  /// @notice Earn some money for honest work
  function doHardWork() external override {
    require(isController(msg.sender) || isGovernance(msg.sender), "SV: Not controller or gov");
    invest();
    uint256 sharePriceBeforeHardWork = getPricePerFullShare();
    IStrategy(strategy()).doHardWork();
    require(ppfsDecreaseAllowed() || sharePriceBeforeHardWork <= getPricePerFullShare(), "SV: PPFS decreased");
  }

  /// @notice Add a reward token to the internal array
  /// @param rt Reward token address
  function addRewardToken(address rt) external override {
    _onlyVaultController(msg.sender);
    require(getRewardTokenIndex(rt) == type(uint256).max);
    require(rt != underlying());
    _rewardTokens.push(rt);
    emit AddedRewardToken(rt);
  }

  /// @notice Remove reward token. Last token removal is not allowed
  /// @param rt Reward token address
  function removeRewardToken(address rt) external override {
    _onlyVaultController(msg.sender);
    uint256 i = getRewardTokenIndex(rt);
    require(i != type(uint256).max);
    require(periodFinishForToken[_rewardTokens[i]] < block.timestamp);
    require(_rewardTokens.length > 1);
    uint256 lastIndex = _rewardTokens.length - 1;
    // swap
    _rewardTokens[i] = _rewardTokens[lastIndex];
    // delete last element
    _rewardTokens.pop();
    emit RemovedRewardToken(rt);
  }

  /// @notice Withdraw all from strategy to the vault and invest again
  function rebalance() external override {
    _onlyVaultController(msg.sender);
    IStrategy(strategy()).withdrawAllToVault();
    invest();
  }

  /// @notice Withdraw all from strategy to the vault
  function withdrawAllToVault() public onlyControllerOrGovernance {
    IStrategy(strategy()).withdrawAllToVault();
  }

  //****************** USER ACTIONS ********************

  /// @notice Allows for depositing the underlying asset in exchange for shares.
  ///         Approval is assumed.
  function deposit(uint256 amount) external override {
    _isActive();
    _onlyAllowedUsers(msg.sender);

    _deposit(amount, msg.sender, msg.sender);
  }

  /// @notice Allows for depositing the underlying asset in exchange for shares.
  ///         Approval is assumed. Immediately invests the asset to the strategy
  function depositAndInvest(uint256 amount) external override {
    _isActive();
    _onlyAllowedUsers(msg.sender);

    _deposit(amount, msg.sender, msg.sender);
    invest();
  }

  /// @notice Allows for depositing the underlying asset in exchange for shares assigned to the holder.
  ///         This facilitates depositing for someone else
  function depositFor(uint256 amount, address holder) external override {
    _isActive();
    _onlyAllowedUsers(msg.sender);

    _deposit(amount, msg.sender, holder);
  }

  /// @notice Withdraw shares partially without touching rewards
  function withdraw(uint256 numberOfShares) external override {
    _onlyAllowedUsers(msg.sender);

    // assume that allowed users is trusted contracts with internal specific logic
    // for compatability we should not claim rewards on withdraw for them
    if (_protectionMode() && !IController(controller()).isAllowedUser(msg.sender)) {
      getAllRewards();
    }

    _withdraw(numberOfShares);
  }

  /// @notice Withdraw all and claim rewards
  function exit() external override {
    _onlyAllowedUsers(msg.sender);
    // for locked functionality need to claim rewards firstly
    // otherwise token transfer will refresh the lock period
    // also it will withdraw claimed tokens too
    getAllRewards();
    _withdraw(balanceOf(msg.sender));
  }

  /// @notice Update and Claim all rewards
  function getAllRewards() public override {
    _onlyAllowedUsers(msg.sender);
    _updateRewards(msg.sender);

    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      _payReward(_rewardTokens[i]);
    }
  }

  /// @notice Update and Claim rewards for specific token
  function getReward(address rt) external override {
    _onlyAllowedUsers(msg.sender);
    _updateReward(msg.sender, rt);
    _payReward(rt);
  }

  /// @dev Update user specific variables
  ///      Store statistical information to Bookkeeper
  function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
    _updateRewards(from);
    _updateRewards(to);

    // mint - assuming it is deposit action
    if (from == address(0)) {
      // new deposit
      if (_underlyingBalanceWithInvestmentForHolder(to) == 0) {
        userBoostTs[to] = block.timestamp;
      }

      // start lock only for new deposits
      if (userLockTs[to] == 0 && lockAllowed()) {
        userLockTs[to] = block.timestamp;
      }

      // store current timestamp
      userLastDepositTs[to] = block.timestamp;
    } else if (to == address(0)) {
      // burn - assuming it is withdraw action
      userLastWithdrawTs[from] = block.timestamp;
    } else {
      // regular transfer

      // we can't normally refresh lock timestamp for locked assets when it transfers to another account
      // need to allow transfers for reward notification process and claim rewards
      require(!lockAllowed()
      || to == address(this)
      || from == address(this)
      || from == controller(), "SV: Transfer forbidden for locked funds");

      // if recipient didn't have deposit - start boost time
      if (_underlyingBalanceWithInvestmentForHolder(to) == 0) {
        userBoostTs[to] = block.timestamp;
      }

      // update only for new deposit for avoiding miscellaneous sending for reset the value
      if (userLastDepositTs[to] == 0) {
        userLastDepositTs[to] = block.timestamp;
      }

      // reset timer if token transferred
      userLastWithdrawTs[from] = block.timestamp;
    }

    // register ownership changing
    // only statistic, no funds affected
    try IBookkeeper(IController(controller()).bookkeeper())
    .registerVaultTransfer(from, to, amount) {
    } catch {}
    super._beforeTokenTransfer(from, to, amount);
  }

  //**************** UNDERLYING MANAGEMENT FUNCTIONALITY ***********************

  /// @notice Return underlying precision units
  function underlyingUnit() public view override returns (uint256) {
    return 10 ** uint256(ERC20Upgradeable(address(underlying())).decimals());
  }

  /// @notice Returns the cash balance across all users in this contract.
  function underlyingBalanceInVault() public view override returns (uint256) {
    return IERC20Upgradeable(underlying()).balanceOf(address(this));
  }

  /// @notice Returns the current underlying (e.g., DAI's) balance together with
  ///         the invested amount (if DAI is invested elsewhere by the strategy).
  function underlyingBalanceWithInvestment() public view override returns (uint256) {
    if (address(strategy()) == address(0)) {
      // initial state, when not set
      return underlyingBalanceInVault();
    }
    return underlyingBalanceInVault()
    .add(IStrategy(strategy()).investedUnderlyingBalance());
  }

  /// @notice Get the user's share (in underlying)
  ///         underlyingBalanceWithInvestment() * balanceOf(holder) / totalSupply()
  function underlyingBalanceWithInvestmentForHolder(address holder)
  external view override returns (uint256) {
    return _underlyingBalanceWithInvestmentForHolder(holder);
  }

  function _underlyingBalanceWithInvestmentForHolder(address holder) internal view returns (uint256) {
    if (totalSupply() == 0) {
      return 0;
    }
    return underlyingBalanceWithInvestment()
    .mul(balanceOf(holder))
    .div(totalSupply());
  }

  /// @notice Price per full share (PPFS)
  ///         Vaults with 100% buybacks have a value of 1 constantly
  ///         (underlyingUnit() * underlyingBalanceWithInvestment()) / totalSupply()
  function getPricePerFullShare() public view override returns (uint256) {
    return totalSupply() == 0
    ? underlyingUnit()
    : underlyingUnit().mul(underlyingBalanceWithInvestment()).div(totalSupply());
  }

  /// @notice Return amount of the underlying asset ready to invest to the strategy
  function availableToInvestOut() public view override returns (uint256) {
    if (strategy() == address(0)) {
      return 0;
    }
    uint256 wantInvestInTotal = underlyingBalanceWithInvestment()
    .mul(toInvest()).div(TO_INVEST_DENOMINATOR);
    uint256 alreadyInvested = IStrategy(strategy()).investedUnderlyingBalance();
    if (alreadyInvested >= wantInvestInTotal) {
      return 0;
    } else {
      uint256 remainingToInvest = wantInvestInTotal.sub(alreadyInvested);
      return remainingToInvest <= underlyingBalanceInVault()
      ? remainingToInvest : underlyingBalanceInVault();
    }
  }

  /// @notice Burn shares, withdraw underlying from strategy
  ///         and send back to the user the underlying asset
  function _withdraw(uint256 numberOfShares) internal {
    require(!reentrantLock(), "SV: Reentrant call");
    _setReentrantLock(true);
    _updateRewards(msg.sender);
    require(totalSupply() > 0, "SV: No shares for withdraw");
    require(numberOfShares > 0, "SV: Zero amount for withdraw");

    // store totalSupply before shares burn
    uint256 _totalSupply = totalSupply();

    // this logic not eligible for normal vaults
    // lockAllowed unchangeable attribute even for proxy upgrade process
    if (lockAllowed()) {
      numberOfShares = _calculateLockedAmount(numberOfShares);
    }

    // only statistic, no funds affected
    try IBookkeeper(IController(controller()).bookkeeper())
    .registerUserAction(msg.sender, numberOfShares, false) {
    } catch {}

    uint256 underlyingAmountToWithdraw = underlyingBalanceWithInvestment()
    .mul(numberOfShares)
    .div(_totalSupply);
    if (underlyingAmountToWithdraw > underlyingBalanceInVault()) {
      // withdraw everything from the strategy to accurately check the share value
      if (numberOfShares == _totalSupply) {
        IStrategy(strategy()).withdrawAllToVault();
      } else {
        uint256 missing = underlyingAmountToWithdraw.sub(underlyingBalanceInVault());
        missing += (missing * (TO_INVEST_DENOMINATOR - toInvest())) / TO_INVEST_DENOMINATOR;
        missing = MathUpgradeable.min(missing, IStrategy(strategy()).investedUnderlyingBalance());
        if (missing > 0) {
          IStrategy(strategy()).withdrawToVault(missing);
        }
      }
      // recalculate to improve accuracy
      underlyingAmountToWithdraw = MathUpgradeable.min(underlyingBalanceWithInvestment()
      .mul(numberOfShares)
      .div(_totalSupply), underlyingBalanceInVault());
    }

    // need to burn shares after strategy withdraw for properly PPFS calculation
    _burn(msg.sender, numberOfShares);

    IERC20Upgradeable(underlying()).safeTransfer(msg.sender, underlyingAmountToWithdraw);

    _setReentrantLock(false);
    // update the withdrawal amount for the holder
    emit Withdraw(msg.sender, underlyingAmountToWithdraw);
  }

  /// @dev Locking logic will add a part of locked shares as rewards for this vault
  ///      Calculate locked amount and distribute locked shares as reward to the current vault
  /// @return Number of shares available to withdraw
  function _calculateLockedAmount(uint256 numberOfShares) internal returns (uint256){
    uint256 lockStart = userLockTs[msg.sender];
    // refresh lock time
    // if full withdraw set timer to 0
    if (balanceOf(msg.sender) == numberOfShares) {
      userLockTs[msg.sender] = 0;
    } else {
      userLockTs[msg.sender] = block.timestamp;
    }
    if (lockStart != 0 && lockStart < block.timestamp) {
      uint256 currentLockDuration = block.timestamp.sub(lockStart);
      if (currentLockDuration < lockPeriod()) {
        uint256 sharesBase = numberOfShares.mul(LOCK_PENALTY_DENOMINATOR - lockPenalty()).div(LOCK_PENALTY_DENOMINATOR);
        uint256 toWithdraw = sharesBase.add(
          numberOfShares.sub(sharesBase).mul(currentLockDuration).div(lockPeriod())
        );
        uint256 lockedSharesToReward = numberOfShares.sub(toWithdraw);
        numberOfShares = toWithdraw;

        // move shares to current contract for using as rewards
        _transfer(msg.sender, address(this), lockedSharesToReward);
        // vault should have itself as reward token for recirculation process
        _notifyRewardWithoutPeriodChange(lockedSharesToReward, address(this));
      }
    }
    return numberOfShares;
  }

  /// @notice Mint shares and transfer underlying from user to the vault
  ///         New shares = (invested amount * total supply) / underlyingBalanceWithInvestment()
  function _deposit(uint256 amount, address sender, address beneficiary) internal {
    require(!reentrantLock(), "SV: Reentrant call");
    _setReentrantLock(true);
    _updateRewards(beneficiary);
    require(amount > 0, "SV: Zero amount");
    require(beneficiary != address(0), "SV: Zero beneficiary for deposit");

    uint256 toMint = totalSupply() == 0
    ? amount
    : amount.mul(totalSupply()).div(underlyingBalanceWithInvestment());
    // no revert for this case for keep compatability
    if (toMint == 0) {
      _setReentrantLock(false);
      return;
    }
    toMint = toMint * (DEPOSIT_FEE_DENOMINATOR - depositFeeNumerator()) / DEPOSIT_FEE_DENOMINATOR;
    _mint(beneficiary, toMint);

    IERC20Upgradeable(underlying()).safeTransferFrom(sender, address(this), amount);

    // only statistic, no funds affected
    try IBookkeeper(IController(controller()).bookkeeper())
    .registerUserAction(beneficiary, toMint, true){
    } catch {}

    _setReentrantLock(false);
    emit Deposit(beneficiary, amount);
  }

  /// @notice Transfer underlying to the strategy
  function invest() internal {
    require(strategy() != address(0));
    uint256 availableAmount = availableToInvestOut();
    if (availableAmount > 0) {
      IERC20Upgradeable(underlying()).safeTransfer(address(strategy()), availableAmount);
      IStrategy(strategy()).investAllUnderlying();
      emit Invest(availableAmount);
    }
  }

  //**************** REWARDS FUNCTIONALITY ***********************

  /// @dev Refresh reward numbers
  function _updateReward(address account, address rt) internal {
    rewardPerTokenStoredForToken[rt] = rewardPerToken(rt);
    lastUpdateTimeForToken[rt] = lastTimeRewardApplicable(rt);
    if (account != address(0) && account != address(this)) {
      rewardsForToken[rt][account] = earned(rt, account);
      userRewardPerTokenPaidForToken[rt][account] = rewardPerTokenStoredForToken[rt];
    }
  }

  /// @dev Use it for any underlying movements
  function _updateRewards(address account) private {
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      _updateReward(account, _rewardTokens[i]);
    }
  }

  /// @notice Return earned rewards for specific token and account (with 100% boost)
  ///         Accurate value returns only after updateRewards call
  ///         ((balanceOf(account)
  ///           * (rewardPerToken - userRewardPerTokenPaidForToken)) / 10**18) + rewardsForToken
  function earned(address rt, address account) public view override returns (uint256) {
    return
    balanceOf(account)
    .mul(rewardPerToken(rt).sub(userRewardPerTokenPaidForToken[rt][account]))
    .div(1e18)
    .add(rewardsForToken[rt][account]);
  }

  /// @notice Return amount ready to claim, calculated with actual boost
  ///         Accurate value returns only after updateRewards call
  function earnedWithBoost(address rt, address account) external view override returns (uint256) {
    uint256 reward = earned(rt, account);
    uint256 boostStart = userBoostTs[account];
    // if we don't have a record we assume that it was deposited before boost logic and use 100% boost
    if (boostStart != 0 && boostStart < block.timestamp) {
      uint256 currentBoostDuration = block.timestamp.sub(boostStart);
      // not 100% boost
      uint256 boostDuration = _vaultController().rewardBoostDuration();
      uint256 rewardRatioWithoutBoost = _vaultController().rewardRatioWithoutBoost();
      if (_protectionMode()) {
        rewardRatioWithoutBoost = 0;
      }
      if (currentBoostDuration < boostDuration) {
        uint256 rewardWithoutBoost = reward.mul(rewardRatioWithoutBoost).div(100);
        // calculate boosted part of rewards
        reward = rewardWithoutBoost.add(
          reward.sub(rewardWithoutBoost).mul(currentBoostDuration).div(boostDuration)
        );
      }
    }
    return reward;
  }

  /// @notice Return reward per token ratio by reward token address
  ///                rewardPerTokenStoredForToken + (
  ///                (lastTimeRewardApplicable - lastUpdateTimeForToken)
  ///                 * rewardRateForToken * 10**18 / totalSupply)
  function rewardPerToken(address rt) public view override returns (uint256) {
    uint256 totalSupplyWithoutItself = totalSupply().sub(balanceOf(address(this)));
    if (totalSupplyWithoutItself == 0) {
      return rewardPerTokenStoredForToken[rt];
    }
    return
    rewardPerTokenStoredForToken[rt].add(
      lastTimeRewardApplicable(rt)
      .sub(lastUpdateTimeForToken[rt])
      .mul(rewardRateForToken[rt])
      .mul(1e18)
      .div(totalSupplyWithoutItself)
    );
  }

  /// @notice Return periodFinishForToken or block.timestamp by reward token address
  function lastTimeRewardApplicable(address rt) public view override returns (uint256) {
    return MathUpgradeable.min(block.timestamp, periodFinishForToken[rt]);
  }

  /// @notice Return reward token array length
  function rewardTokens() external view override returns (address[] memory){
    return _rewardTokens;
  }

  /// @notice Return reward token array length
  function rewardTokensLength() external view override returns (uint256){
    return _rewardTokens.length;
  }

  /// @notice Return reward token index
  ///         If the return value is MAX_UINT256, it means that
  ///         the specified reward token is not in the list
  function getRewardTokenIndex(address rt) public override view returns (uint256) {
    for (uint i = 0; i < _rewardTokens.length; i++) {
      if (_rewardTokens[i] == rt)
        return i;
    }
    return type(uint256).max;
  }

  /// @notice Update rewardRateForToken
  ///         If period ended: reward / duration
  ///         else add leftover to the reward amount and refresh the period
  ///         (reward + ((periodFinishForToken - block.timestamp) * rewardRateForToken)) / duration
  function notifyTargetRewardAmount(address _rewardToken, uint256 amount) external override {
    require(IController(controller()).isRewardDistributor(msg.sender), "SV: Only distributor");
    _updateRewards(address(0));
    // register notified amount for statistical purposes
    IBookkeeper(IController(controller()).bookkeeper())
    .registerRewardDistribution(address(this), _rewardToken, amount);

    // overflow fix according to https://sips.synthetix.io/sips/sip-77
    require(amount < type(uint256).max / 1e18, "SV: Amount overflow");
    uint256 i = getRewardTokenIndex(_rewardToken);
    require(i != type(uint256).max, "SV: RT not found");

    IERC20Upgradeable(_rewardToken).safeTransferFrom(msg.sender, address(this), amount);

    if (block.timestamp >= periodFinishForToken[_rewardToken]) {
      rewardRateForToken[_rewardToken] = amount.div(duration());
    } else {
      uint256 remaining = periodFinishForToken[_rewardToken].sub(block.timestamp);
      uint256 leftover = remaining.mul(rewardRateForToken[_rewardToken]);
      rewardRateForToken[_rewardToken] = amount.add(leftover).div(duration());
    }
    lastUpdateTimeForToken[_rewardToken] = block.timestamp;
    periodFinishForToken[_rewardToken] = block.timestamp.add(duration());

    // Ensure the provided reward amount is not more than the balance in the contract.
    // This keeps the reward rate in the right range, preventing overflows due to
    // very high values of rewardRate in the earned and rewardsPerToken functions;
    // Reward + leftover must be less than 2^256 / 10^18 to avoid overflow.
    uint balance = IERC20Upgradeable(_rewardToken).balanceOf(address(this));
    require(rewardRateForToken[_rewardToken] <= balance.div(duration()), "SV: Provided reward too high");
    emit RewardAdded(_rewardToken, amount);
  }

  /// @dev Assume approve
  ///      Add reward amount without changing reward duration
  function notifyRewardWithoutPeriodChange(address _rewardToken, uint256 _amount) external override {
    require(IController(controller()).isRewardDistributor(msg.sender), "SV: Only distributor");
    IERC20Upgradeable(_rewardToken).safeTransferFrom(msg.sender, address(this), _amount);
    _notifyRewardWithoutPeriodChange(_amount, _rewardToken);
  }

  /// @notice Transfer earned rewards to caller
  function _payReward(address rt) internal {
    uint256 reward = earned(rt, msg.sender);
    if (reward > 0 && IERC20Upgradeable(rt).balanceOf(address(this)) >= reward) {
      // calculate boosted amount
      uint256 boostStart = userBoostTs[msg.sender];
      // refresh boost
      userBoostTs[msg.sender] = block.timestamp;
      // if we don't have a record we assume that it was deposited before boost logic and use 100% boost
      // allow claim without penalty to some addresses, TetuSwap pairs as example
      if (
        boostStart != 0
        && boostStart < block.timestamp
        && !IController(controller()).isPoorRewardConsumer(msg.sender)
      ) {
        uint256 currentBoostDuration = block.timestamp.sub(boostStart);
        // not 100% boost
        uint256 boostDuration = _vaultController().rewardBoostDuration();
        uint256 rewardRatioWithoutBoost = _vaultController().rewardRatioWithoutBoost();
        if (_protectionMode()) {
          rewardRatioWithoutBoost = 0;
        }
        if (currentBoostDuration < boostDuration) {
          uint256 rewardWithoutBoost = reward.mul(rewardRatioWithoutBoost).div(100);
          // calculate boosted part of rewards
          uint256 toClaim = rewardWithoutBoost.add(
            reward.sub(rewardWithoutBoost).mul(currentBoostDuration).div(boostDuration)
          );
          uint256 change = reward.sub(toClaim);
          reward = toClaim;

          _notifyRewardWithoutPeriodChange(change, rt);
        }
      }

      rewardsForToken[rt][msg.sender] = 0;
      IERC20Upgradeable(rt).safeTransfer(msg.sender, reward);
      // only statistic, should not affect reward claim process
      try IBookkeeper(IController(controller()).bookkeeper())
      .registerUserEarned(msg.sender, address(this), rt, reward) {
      } catch {}
      emit RewardPaid(msg.sender, rt, reward);
    }
  }

  /// @dev Add reward amount without changing reward duration
  function _notifyRewardWithoutPeriodChange(uint256 _amount, address _rewardToken) internal {
    _updateRewards(address(0));
    require(getRewardTokenIndex(_rewardToken) != type(uint256).max, "SV: RT not found");
    if (_amount > 1 && _amount < type(uint256).max / 1e18) {
      rewardPerTokenStoredForToken[_rewardToken] = rewardPerToken(_rewardToken);
      lastUpdateTimeForToken[_rewardToken] = lastTimeRewardApplicable(_rewardToken);
      if (block.timestamp >= periodFinishForToken[_rewardToken]) {
        // if vesting ended transfer the change to the controller
        // otherwise we will have possible infinity rewards duration
        IERC20Upgradeable(_rewardToken).safeTransfer(controller(), _amount);
        emit RewardSentToController(_rewardToken, _amount);
      } else {
        uint256 remaining = periodFinishForToken[_rewardToken].sub(block.timestamp);
        uint256 leftover = remaining.mul(rewardRateForToken[_rewardToken]);
        rewardRateForToken[_rewardToken] = _amount.add(leftover).div(remaining);
        emit RewardRecirculated(_rewardToken, _amount);
      }
    }
  }

  /// @notice Disable strategy and move rewards to controller
  function stop() external override {
    _onlyVaultController(msg.sender);
    IStrategy(strategy()).withdrawAllToVault();
    _setActive(false);

    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address rt = _rewardTokens[i];
      periodFinishForToken[rt] = block.timestamp;
      rewardRateForToken[rt] = 0;
      uint256 amount = IERC20Upgradeable(rt).balanceOf(address(this));
      if (amount != 0) {
        IERC20Upgradeable(rt).safeTransfer(controller(), amount);
      }
      emit RewardMovedToController(rt, amount);
    }
  }

  //**************** STRATEGY UPDATE FUNCTIONALITY ***********************

  /// @notice Check the strategy time lock, withdraw all to the vault and change the strategy
  ///         Should be called via controller
  function setStrategy(address _strategy) external override {
    require(controller() == msg.sender, "SV: Not controller");
    require(_strategy != address(0));
    require(IStrategy(_strategy).underlying() == address(underlying()));
    require(IStrategy(_strategy).vault() == address(this));
    require(IControllable(_strategy).isController(controller()));

    emit StrategyChanged(_strategy, strategy());
    if (_strategy != strategy()) {
      if (strategy() != address(0)) {// if the original strategy (no underscore) is defined
        IERC20Upgradeable(underlying()).safeApprove(address(strategy()), 0);
        IStrategy(strategy()).withdrawAllToVault();
      }
      _setStrategy(_strategy);
      IERC20Upgradeable(underlying()).safeApprove(address(strategy()), 0);
      IERC20Upgradeable(underlying()).safeApprove(address(strategy()), type(uint256).max);
      IController(controller()).addStrategy(_strategy);
    }
  }

}
