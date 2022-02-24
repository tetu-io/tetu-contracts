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

import "../../openzeppelin/Math.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/ERC20Upgradeable.sol";
import "./VaultStorage.sol";
import "./VaultLibrary.sol";
import "../governance/ControllableV2.sol";
import "../interface/IStrategy.sol";
import "../interface/IController.sol";
import "../interface/IBookkeeper.sol";
import "../interface/IVaultController.sol";

/// @title Smart Vault is a combination of implementations drawn from Synthetix pool
///        for their innovative reward vesting and Yearn vault for their share price model
/// @dev Use with TetuProxy
/// @author belbix
contract SmartVault is Initializable, ERC20Upgradeable, VaultStorage, ControllableV2 {
  using SafeERC20 for IERC20;

  // ************* CONSTANTS ********************
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.10.2";
  /// @dev Denominator for penalty numerator
  uint256 public constant LOCK_PENALTY_DENOMINATOR = 1000;
  uint256 public constant TO_INVEST_DENOMINATOR = 1000;
  uint256 public constant DEPOSIT_FEE_DENOMINATOR = 10000;
  uint256 private constant NAME_OVERRIDE_ID = 0;
  uint256 private constant SYMBOL_OVERRIDE_ID = 1;
  string private constant FORBIDDEN_MSG = "SV: Forbidden";

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
  /// @param __underlying Vault underlying address
  /// @param _duration Rewards duration
  /// @param _lockAllowed Set true with lock mechanic requires
  /// @param _rewardToken Reward token address. Set zero address if not requires
  function initializeSmartVault(
    string memory _name,
    string memory _symbol,
    address _controller,
    address __underlying,
    uint256 _duration,
    bool _lockAllowed,
    address _rewardToken,
    uint _depositFee
  ) external initializer {
    __ERC20_init(_name, _symbol);

    ControllableV2.initializeControllable(_controller);
    VaultStorage.initializeVaultStorage(
      __underlying,
      _duration,
      _lockAllowed
    );
    // initialize reward token for easily deploy new vaults from deployer address
    if (_rewardToken != address(0)) {
      require(_rewardToken != _underlying());
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
    require(IController(_controller()).vaultController() == _sender, FORBIDDEN_MSG);
  }

  /// @dev Allowed only for active strategy
  function _isActive() private view {
    require(_active(), "SV: Not active");
  }

  /// @dev Only smart contracts will be affected by this restriction
  ///      If it is a contract it should be whitelisted
  function _onlyAllowedUsers(address _sender) private view {
    require(IController(_controller()).isAllowedUser(_sender), FORBIDDEN_MSG);
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
    return ERC20Upgradeable(_underlying()).decimals();
  }

  /// @dev Returns vault controller
  function _vaultController() internal view returns (IVaultController){
    return IVaultController(IController(_controller()).vaultController());
  }

  // ************ GOVERNANCE ACTIONS ******************

  /// @notice Override vault name
  function overrideName(string calldata value) external {
    require(_isGovernance(msg.sender));
    _nameOverrides[NAME_OVERRIDE_ID] = value;
  }

  /// @notice Override vault name
  function overrideSymbol(string calldata value) external {
    require(_isGovernance(msg.sender));
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
    require(_isController(msg.sender) || _isGovernance(msg.sender), FORBIDDEN_MSG);
    require(_lockAllowed());
    require(lockPeriod() == 0);
    _setLockPeriod(_value);
  }

  /// @notice Set lock initial penalty nominator. Can be called only once
  /// @param _value Penalty denominator, should be in range 0 - (LOCK_PENALTY_DENOMINATOR / 2)
  function setLockPenalty(uint256 _value) external override {
    require(_isController(msg.sender) || _isGovernance(msg.sender), FORBIDDEN_MSG);
    require(_value <= (LOCK_PENALTY_DENOMINATOR / 2));
    require(_lockAllowed());
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
    require(_lockAllowed());
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
    require(_isGovernance(msg.sender), FORBIDDEN_MSG);
    _setProtectionMode(_active);
  }

  /// @notice If true we will call doHardWork for each invest action
  /// @param _active Status true - active, false - deactivated
  function changeDoHardWorkOnInvest(bool _active) external {
    require(_isGovernance(msg.sender), FORBIDDEN_MSG);
    _setDoHardWorkOnInvest(_active);
  }

  /// @notice If true we will call invest for each deposit
  /// @param _active Status true - active, false - deactivated
  function changeAlwaysInvest(bool _active) external {
    require(_isGovernance(msg.sender), FORBIDDEN_MSG);
    _setAlwaysInvest(_active);
  }

  /// @notice Earn some money for honest work
  function doHardWork() external override {
    require(_isController(msg.sender) || _isGovernance(msg.sender), FORBIDDEN_MSG);
    _invest();
    // otherwise we already do
    if (!_doHardWorkOnInvest()) {
      _doHardWork();
    }
  }

  function _doHardWork() internal {
    uint256 sharePriceBeforeHardWork = _getPricePerFullShare();
    IStrategy(_strategy()).doHardWork();
    require(ppfsDecreaseAllowed() || sharePriceBeforeHardWork <= _getPricePerFullShare(), "SV: PPFS decreased");
  }

  /// @notice Add a reward token to the internal array
  /// @param rt Reward token address
  function addRewardToken(address rt) external override {
    _onlyVaultController(msg.sender);
    require(_getRewardTokenIndex(rt) == type(uint256).max);
    require(rt != _underlying());
    _rewardTokens.push(rt);
    emit AddedRewardToken(rt);
  }

  /// @notice Remove reward token. Last token removal is not allowed
  /// @param rt Reward token address
  function removeRewardToken(address rt) external override {
    _onlyVaultController(msg.sender);
    uint256 i = _getRewardTokenIndex(rt);
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
    IStrategy(_strategy()).withdrawAllToVault();
    _invest();
  }

  /// @notice Withdraw all from strategy to the vault
  function withdrawAllToVault() external {
    require(address(_controller()) == msg.sender
      || IController(_controller()).governance() == msg.sender, FORBIDDEN_MSG);
    IStrategy(_strategy()).withdrawAllToVault();
  }

  //****************** USER ACTIONS ********************

  /// @notice Allows for depositing the underlying asset in exchange for shares.
  ///         Approval is assumed.
  function deposit(uint256 amount) external override {
    _isActive();
    _onlyAllowedUsers(msg.sender);

    _deposit(amount, msg.sender, msg.sender);
    if (_alwaysInvest()) {
      _invest();
    }
  }

  /// @notice Allows for depositing the underlying asset in exchange for shares.
  ///         Approval is assumed. Immediately invests the asset to the strategy
  function depositAndInvest(uint256 amount) external override {
    _isActive();
    _onlyAllowedUsers(msg.sender);

    _deposit(amount, msg.sender, msg.sender);
    _invest();
  }

  /// @notice Allows for depositing the underlying asset in exchange for shares assigned to the holder.
  ///         This facilitates depositing for someone else
  function depositFor(uint256 amount, address holder) external override {
    _isActive();
    _onlyAllowedUsers(msg.sender);

    _deposit(amount, msg.sender, holder);
    if (_alwaysInvest()) {
      _invest();
    }
  }

  /// @notice Withdraw shares partially without touching rewards
  function withdraw(uint256 numberOfShares) external override {
    _onlyAllowedUsers(msg.sender);

    // assume that allowed users is trusted contracts with internal specific logic
    // for compatability we should not claim rewards on withdraw for them
    if (_protectionMode() && !IController(_controller()).isAllowedUser(msg.sender)) {
      _getAllRewards();
    }

    _withdraw(numberOfShares);
  }

  /// @notice Withdraw all and claim rewards
  function exit() external override {
    _onlyAllowedUsers(msg.sender);
    // for locked functionality need to claim rewards firstly
    // otherwise token transfer will refresh the lock period
    // also it will withdraw claimed tokens too
    _getAllRewards();
    _withdraw(balanceOf(msg.sender));
  }

  /// @notice Update and Claim all rewards
  function getAllRewards() external override {
    _onlyAllowedUsers(msg.sender);
    _getAllRewards();
  }

  function _getAllRewards() internal {
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
      if (userLockTs[to] == 0 && _lockAllowed()) {
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
      require(!_lockAllowed()
      || to == address(this)
      || from == address(this)
      || from == _controller(), FORBIDDEN_MSG);

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
    try IBookkeeper(IController(_controller()).bookkeeper())
    .registerVaultTransfer(from, to, amount) {
    } catch {}
    super._beforeTokenTransfer(from, to, amount);
  }

  //**************** UNDERLYING MANAGEMENT FUNCTIONALITY ***********************

  /// @notice Return underlying precision units
  function underlyingUnit() external view override returns (uint256) {
    return _underlyingUnit();
  }

  function _underlyingUnit() internal view returns (uint256) {
    return 10 ** uint256(ERC20Upgradeable(address(_underlying())).decimals());
  }

  /// @notice Returns the cash balance across all users in this contract.
  function underlyingBalanceInVault() external view override returns (uint256) {
    return _underlyingBalanceInVault();
  }

  function _underlyingBalanceInVault() internal view returns (uint256) {
    return IERC20(_underlying()).balanceOf(address(this));
  }

  /// @notice Returns the current underlying (e.g., DAI's) balance together with
  ///         the invested amount (if DAI is invested elsewhere by the strategy).
  function underlyingBalanceWithInvestment() external view override returns (uint256) {
    return _underlyingBalanceWithInvestment();
  }

  function _underlyingBalanceWithInvestment() internal view returns (uint256) {
    return VaultLibrary.underlyingBalanceWithInvestment(
      _strategy(),
      IERC20(_underlying()).balanceOf(address(this))
    );
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
    return _underlyingBalanceWithInvestment() * balanceOf(holder) / totalSupply();
  }

  /// @notice Price per full share (PPFS)
  ///         Vaults with 100% buybacks have a value of 1 constantly
  ///         (underlyingUnit() * underlyingBalanceWithInvestment()) / totalSupply()
  function getPricePerFullShare() external view override returns (uint256) {
    return _getPricePerFullShare();
  }

  function _getPricePerFullShare() internal view returns (uint256) {
    return totalSupply() == 0
    ? _underlyingUnit()
    : _underlyingUnit() * _underlyingBalanceWithInvestment() / totalSupply();
  }

  /// @notice Return amount of the underlying asset ready to invest to the strategy
  function availableToInvestOut() external view override returns (uint256) {
    return _availableToInvestOut();
  }

  function _availableToInvestOut() internal view returns (uint256) {
    return VaultLibrary.availableToInvestOut(
      _strategy(),
      _toInvest(),
      _underlyingBalanceInVault()
    );
  }

  /// @notice Burn shares, withdraw underlying from strategy
  ///         and send back to the user the underlying asset
  function _withdraw(uint256 numberOfShares) internal {
    require(!_reentrantLock(), "SV: Reentrant call");
    _setReentrantLock(true);
    _updateRewards(msg.sender);
    require(totalSupply() > 0, "SV: No shares for withdraw");
    require(numberOfShares > 0, "SV: Zero amount for withdraw");

    // store totalSupply before shares burn
    uint256 _totalSupply = totalSupply();

    // this logic not eligible for normal vaults
    if (_lockAllowed()) {
      numberOfShares = _processLockedAmount(numberOfShares);
    }

    // only statistic, no funds affected
    try IBookkeeper(IController(_controller()).bookkeeper())
    .registerUserAction(msg.sender, numberOfShares, false) {
    } catch {}

    uint256 underlyingAmountToWithdraw = VaultLibrary.processWithdrawFromStrategy(
      numberOfShares,
      _underlying(),
      _totalSupply,
      _toInvest(),
      _strategy()
    );

    // need to burn shares after strategy withdraw for properly PPFS calculation
    _burn(msg.sender, numberOfShares);

    IERC20(_underlying()).safeTransfer(msg.sender, underlyingAmountToWithdraw);

    _setReentrantLock(false);
    // update the withdrawal amount for the holder
    emit Withdraw(msg.sender, underlyingAmountToWithdraw);
  }

  /// @dev Locking logic will add a part of locked shares as rewards for this vault
  ///      Calculate locked amount and distribute locked shares as reward to the current vault
  /// @return Number of shares available to withdraw
  function _processLockedAmount(uint256 numberOfShares) internal returns (uint256){
    (uint numberOfSharesAdjusted, uint lockedSharesToReward) = VaultLibrary.calculateLockedAmount(
      numberOfShares,
      userLockTs,
      lockPeriod(),
      lockPenalty(),
      balanceOf(msg.sender)
    );

    if (lockedSharesToReward != 0) {
      // move shares to current contract for using as rewards
      _transfer(msg.sender, address(this), lockedSharesToReward);
      // vault should have itself as reward token for recirculation process
      _notifyRewardWithoutPeriodChange(lockedSharesToReward, address(this));
    }

    return numberOfSharesAdjusted;
  }

  /// @notice Mint shares and transfer underlying from user to the vault
  ///         New shares = (invested amount * total supply) / underlyingBalanceWithInvestment()
  function _deposit(uint256 amount, address sender, address beneficiary) internal {
    require(!_reentrantLock(), "SV: Reentrant call");
    _setReentrantLock(true);
    _updateRewards(beneficiary);
    require(amount > 0, "SV: Zero amount");
    require(beneficiary != address(0), "SV: Zero beneficiary for deposit");

    uint256 toMint = totalSupply() == 0
    ? amount
    : amount * totalSupply() / _underlyingBalanceWithInvestment();
    // no revert for this case for keep compatability
    if (toMint != 0) {
      toMint = toMint * (DEPOSIT_FEE_DENOMINATOR - _depositFeeNumerator()) / DEPOSIT_FEE_DENOMINATOR;
      _mint(beneficiary, toMint);

      IERC20(_underlying()).safeTransferFrom(sender, address(this), amount);

      // only statistic, no funds affected
      try IBookkeeper(IController(_controller()).bookkeeper())
      .registerUserAction(beneficiary, toMint, true){
      } catch {}
      emit Deposit(beneficiary, amount);
    }
    _setReentrantLock(false);
  }

  /// @notice Transfer underlying to the strategy
  function _invest() internal {
    require(_strategy() != address(0));
    // avoid recursive hardworks
    if (_doHardWorkOnInvest() && msg.sender != _strategy()) {
      _doHardWork();
    }
    uint256 availableAmount = _availableToInvestOut();
    if (availableAmount > 0) {
      IERC20(_underlying()).safeTransfer(address(_strategy()), availableAmount);
      IStrategy(_strategy()).investAllUnderlying();
      emit Invest(availableAmount);
    }
  }

  //**************** REWARDS FUNCTIONALITY ***********************

  /// @dev Refresh reward numbers
  function _updateReward(address account, address rt) internal {
    rewardPerTokenStoredForToken[rt] = _rewardPerToken(rt);
    lastUpdateTimeForToken[rt] = _lastTimeRewardApplicable(rt);
    if (account != address(0) && account != address(this)) {
      rewardsForToken[rt][account] = _earned(rt, account);
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
  function earned(address rt, address account) external view override returns (uint256) {
    return _earned(rt, account);
  }

  function _earned(address rt, address account) internal view returns (uint256) {
    return balanceOf(account)
    * (_rewardPerToken(rt) - userRewardPerTokenPaidForToken[rt][account])
    / 1e18
    + rewardsForToken[rt][account];
  }

  /// @notice Return amount ready to claim, calculated with actual boost
  ///         Accurate value returns only after updateRewards call
  function earnedWithBoost(address rt, address account) external view override returns (uint256) {
    return VaultLibrary.earnedWithBoost(
      _earned(rt, account),
      userBoostTs[account],
      _controller(),
      _protectionMode()
    );
  }

  /// @notice Return reward per token ratio by reward token address
  ///                rewardPerTokenStoredForToken + (
  ///                (lastTimeRewardApplicable - lastUpdateTimeForToken)
  ///                 * rewardRateForToken * 10**18 / totalSupply)
  function rewardPerToken(address rt) external view override returns (uint256) {
    return _rewardPerToken(rt);
  }

  function _rewardPerToken(address rt) internal view returns (uint256) {
    uint256 totalSupplyWithoutItself = totalSupply() - balanceOf(address(this));
    if (totalSupplyWithoutItself == 0) {
      return rewardPerTokenStoredForToken[rt];
    }
    return
    rewardPerTokenStoredForToken[rt] + (
    (_lastTimeRewardApplicable(rt) - lastUpdateTimeForToken[rt])
    * rewardRateForToken[rt]
    * 1e18
    / totalSupplyWithoutItself
    );
  }

  /// @notice Return periodFinishForToken or block.timestamp by reward token address
  function lastTimeRewardApplicable(address rt) external view override returns (uint256) {
    return _lastTimeRewardApplicable(rt);
  }

  function _lastTimeRewardApplicable(address rt) internal view returns (uint256) {
    return Math.min(block.timestamp, periodFinishForToken[rt]);
  }

  /// @notice Return reward token array
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
  function getRewardTokenIndex(address rt) external override view returns (uint256) {
    return _getRewardTokenIndex(rt);
  }

  function _getRewardTokenIndex(address rt) internal view returns (uint256) {
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
    require(IController(_controller()).isRewardDistributor(msg.sender), FORBIDDEN_MSG);
    _updateRewards(address(0));
    // register notified amount for statistical purposes
    IBookkeeper(IController(_controller()).bookkeeper())
    .registerRewardDistribution(address(this), _rewardToken, amount);

    // overflow fix according to https://sips.synthetix.io/sips/sip-77
    require(amount < type(uint256).max / 1e18, "SV: Amount overflow");
    uint256 i = _getRewardTokenIndex(_rewardToken);
    require(i != type(uint256).max, "SV: RT not found");

    IERC20(_rewardToken).safeTransferFrom(msg.sender, address(this), amount);

    if (block.timestamp >= periodFinishForToken[_rewardToken]) {
      rewardRateForToken[_rewardToken] = amount / duration();
    } else {
      uint256 remaining = periodFinishForToken[_rewardToken] - block.timestamp;
      uint256 leftover = remaining * rewardRateForToken[_rewardToken];
      rewardRateForToken[_rewardToken] = (amount + leftover) / duration();
    }
    lastUpdateTimeForToken[_rewardToken] = block.timestamp;
    periodFinishForToken[_rewardToken] = block.timestamp + duration();

    // Ensure the provided reward amount is not more than the balance in the contract.
    // This keeps the reward rate in the right range, preventing overflows due to
    // very high values of rewardRate in the earned and rewardsPerToken functions;
    // Reward + leftover must be less than 2^256 / 10^18 to avoid overflow.
    uint balance = IERC20(_rewardToken).balanceOf(address(this));
    require(rewardRateForToken[_rewardToken] <= balance / duration(), "SV: Provided reward too high");
    emit RewardAdded(_rewardToken, amount);
  }

  /// @dev Assume approve
  ///      Add reward amount without changing reward duration
  function notifyRewardWithoutPeriodChange(address _rewardToken, uint256 _amount) external override {
    require(IController(_controller()).isRewardDistributor(msg.sender), FORBIDDEN_MSG);
    IERC20(_rewardToken).safeTransferFrom(msg.sender, address(this), _amount);
    _notifyRewardWithoutPeriodChange(_amount, _rewardToken);
  }

  /// @notice Transfer earned rewards to caller
  function _payReward(address rt) internal {
    (uint renotifiedAmount, uint paidReward) = VaultLibrary.processPayReward(
      rt,
      _earned(rt, msg.sender),
      userBoostTs,
      _controller(),
      _protectionMode(),
      rewardsForToken
    );
    if (renotifiedAmount != 0) {
      _notifyRewardWithoutPeriodChange(renotifiedAmount, rt);
    }
    if (paidReward != 0) {
      emit RewardPaid(msg.sender, rt, renotifiedAmount);
    }
  }

  /// @dev Add reward amount without changing reward duration
  function _notifyRewardWithoutPeriodChange(uint256 _amount, address _rewardToken) internal {
    _updateRewards(address(0));
    require(_getRewardTokenIndex(_rewardToken) != type(uint256).max, "SV: RT not found");
    if (_amount > 1 && _amount < type(uint256).max / 1e18) {
      rewardPerTokenStoredForToken[_rewardToken] = _rewardPerToken(_rewardToken);
      lastUpdateTimeForToken[_rewardToken] = _lastTimeRewardApplicable(_rewardToken);
      if (block.timestamp >= periodFinishForToken[_rewardToken]) {
        // if vesting ended transfer the change to the controller
        // otherwise we will have possible infinity rewards duration
        IERC20(_rewardToken).safeTransfer(_controller(), _amount);
        emit RewardSentToController(_rewardToken, _amount);
      } else {
        uint256 remaining = periodFinishForToken[_rewardToken] - block.timestamp;
        uint256 leftover = remaining * rewardRateForToken[_rewardToken];
        rewardRateForToken[_rewardToken] = (_amount + leftover) / remaining;
        emit RewardRecirculated(_rewardToken, _amount);
      }
    }
  }

  /// @notice Disable strategy and move rewards to controller
  function stop() external override {
    _onlyVaultController(msg.sender);
    IStrategy(_strategy()).withdrawAllToVault();
    _setActive(false);

    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address rt = _rewardTokens[i];
      periodFinishForToken[rt] = block.timestamp;
      rewardRateForToken[rt] = 0;
      uint256 amount = IERC20(rt).balanceOf(address(this));
      if (amount != 0) {
        IERC20(rt).safeTransfer(_controller(), amount);
      }
      emit RewardMovedToController(rt, amount);
    }
  }

  //**************** STRATEGY UPDATE FUNCTIONALITY ***********************

  /// @notice Check the strategy time lock, withdraw all to the vault and change the strategy
  ///         Should be called via controller
  function setStrategy(address newStrategy) external override {
    // the main functionality moved to library for reduce contract size
    VaultLibrary.changeStrategy(_controller(), _underlying(), newStrategy, _strategy());
    emit StrategyChanged(newStrategy, _strategy());
    _setStrategy(newStrategy);
  }

}
