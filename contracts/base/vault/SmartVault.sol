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
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "../interface/IStrategy.sol";
import "../interface/ISmartVault.sol";
import "../interface/IController.sol";
import "../interface/IUpgradeSource.sol";
import "../interface/ISmartVault.sol";
import "../interface/IVaultController.sol";
import "./VaultStorage.sol";
import "../governance/Controllable.sol";
import "../interface/IBookkeeper.sol";

/// @title Smart Vault is a combination of implementations drawn from Synthetix pool
///        for their innovative reward vesting and Yearn vault for their share price model
/// @dev Use with TetuProxy
/// @author belbix
contract SmartVault is Initializable, ERC20Upgradeable, VaultStorage, Controllable, ReentrancyGuard {
  using SafeERC20Upgradeable for IERC20Upgradeable;
  using SafeMathUpgradeable for uint256;

  // ************* CONSTANTS ********************
  string public constant VERSION = "1.1.0";

  // ********************* VARIABLES *****************
  //in upgradable contracts you can skip storage ONLY for mapping and dynamically-sized array types
  //https://docs.soliditylang.org/en/v0.4.21/miscellaneous.html#layout-of-state-variables-in-storage
  //use VaultStorage for primitive variables
  address[] internal _rewardTokens;
  mapping(address => uint256) public override periodFinishForToken;
  mapping(address => uint256) public override rewardRateForToken;
  mapping(address => uint256) public override lastUpdateTimeForToken;
  mapping(address => uint256) public override rewardPerTokenStoredForToken;
  mapping(address => mapping(address => uint256)) public override userRewardPerTokenPaidForToken;
  mapping(address => mapping(address => uint256)) public override rewardsForToken;
  mapping(address => uint256) public override userLastWithdrawTs;
  mapping(address => uint256) public override userBoostTs;

  function initializeSmartVault(
    string memory _name,
    string memory _symbol,
    address _controller,
    address _underlying,
    uint256 _duration
  ) external initializer {
    __ERC20_init(_name, _symbol);

    Controllable.initializeControllable(_controller);
    VaultStorage.initializeVaultStorage(
      _underlying,
      _duration
    );
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

  function decimals() public view override returns (uint8) {
    return ERC20Upgradeable(underlying()).decimals();
  }


  // *************** MODIFIERS ***************************

  /// @dev Allow operation only for VaultController
  modifier onlyVaultController() {
    require(IController(controller()).vaultController() == msg.sender, "not vault controller");
    _;
  }

  /// @dev Strategy should not be a zero address
  modifier whenStrategyDefined() {
    require(address(strategy()) != address(0), "zero strat");
    _;
  }

  /// @dev Allowed only for active strategy
  modifier isActive() {
    require(active(), "not active");
    _;
  }

  /// @dev Use it for any underlying movements
  modifier updateRewards(address account) {
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address rt = _rewardTokens[i];
      rewardPerTokenStoredForToken[rt] = rewardPerToken(rt);
      lastUpdateTimeForToken[rt] = lastTimeRewardApplicable(rt);
      if (account != address(0)) {
        rewardsForToken[rt][account] = earned(rt, account);
        userRewardPerTokenPaidForToken[rt][account] = rewardPerTokenStoredForToken[rt];
      }
    }
    _;
  }

  /// @dev Use it for any underlying movements
  modifier updateReward(address account, address rt){
    rewardPerTokenStoredForToken[rt] = rewardPerToken(rt);
    lastUpdateTimeForToken[rt] = lastTimeRewardApplicable(rt);
    rewardsForToken[rt][account] = earned(rt, account);
    userRewardPerTokenPaidForToken[rt][account] = rewardPerTokenStoredForToken[rt];
    _;
  }

  // ************ GOVERNANCE ACTIONS ******************

  /// @notice Change the active state marker
  /// @param _active Status true - active, false - deactivated
  function changeActivityStatus(bool _active) external override onlyVaultController {
    _setActive(_active);
  }

  /// @notice Call DoHardWork process
  function doHardWork() external whenStrategyDefined onlyControllerOrGovernance isActive override {
    uint256 sharePriceBeforeHardWork = getPricePerFullShare();
    IStrategy(strategy()).doHardWork();
    require(sharePriceBeforeHardWork <= getPricePerFullShare(), "ppfs decreased");
  }

  /// @notice Add a reward token to the internal array
  /// @param rt Reward token address
  function addRewardToken(address rt) external override onlyVaultController {
    require(getRewardTokenIndex(rt) == type(uint256).max, "rt exist");
    require(rt != underlying(), "rt is underlying");
    _rewardTokens.push(rt);
    emit AddedRewardToken(rt);
  }

  /// @notice Remove reward token. Last token removal is not allowed
  /// @param rt Reward token address
  function removeRewardToken(address rt) external override onlyVaultController {
    uint256 i = getRewardTokenIndex(rt);
    require(i != type(uint256).max, "not exist");
    require(periodFinishForToken[_rewardTokens[i]] < block.timestamp, "not finished");
    require(_rewardTokens.length > 1, "last rt");
    uint256 lastIndex = _rewardTokens.length - 1;
    // swap
    _rewardTokens[i] = _rewardTokens[lastIndex];
    // delete last element
    _rewardTokens.pop();
    emit RemovedRewardToken(rt);
  }

  /// @notice Withdraw all from strategy to the vault and invest again
  function rebalance() external onlyControllerOrGovernance {
    withdrawAllToVault();
    invest();
  }

  /// @notice Withdraw all from strategy to the vault
  function withdrawAllToVault() public onlyControllerOrGovernance whenStrategyDefined {
    IStrategy(strategy()).withdrawAllToVault();
  }

  //****************** USER ACTIONS ********************

  /// @notice Allows for depositing the underlying asset in exchange for shares.
  ///         Approval is assumed.
  function deposit(uint256 amount) external override nonReentrant onlyAllowedUsers isActive {
    _deposit(amount, msg.sender, msg.sender);
  }

  /// @notice Allows for depositing the underlying asset in exchange for shares.
  ///         Approval is assumed. Immediately invests the asset to the strategy
  function depositAndInvest(uint256 amount) external override nonReentrant onlyAllowedUsers isActive {
    _deposit(amount, msg.sender, msg.sender);
    invest();
  }

  /// @notice Allows for depositing the underlying asset in exchange for shares assigned to the holder.
  ///         This facilitates depositing for someone else
  function depositFor(uint256 amount, address holder) external override nonReentrant onlyAllowedUsers isActive {
    _deposit(amount, msg.sender, holder);
  }

  /// @notice Withdraw shares partially without touching rewards
  function withdraw(uint256 numberOfShares) external override nonReentrant onlyAllowedUsers {
    _withdraw(numberOfShares);
  }

  /// @notice Withdraw all and claim rewards
  function exit() external override nonReentrant onlyAllowedUsers {
    _withdraw(balanceOf(msg.sender));
    getAllRewards();
  }

  /// @notice Update and Claim all rewards
  function getAllRewards() public override updateRewards(msg.sender) onlyAllowedUsers {
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      _payReward(_rewardTokens[i]);
    }
  }

  /// @notice Update and Claim rewards for specific token
  function getReward(address rt) external override updateReward(msg.sender, rt) onlyAllowedUsers {
    _payReward(rt);
  }

  /// @dev Update userBoostTs
  ///      Store statistical information to Bookkeeper when token transferred
  function _beforeTokenTransfer(address from, address to, uint256 amount)
  internal override updateRewards(from) updateRewards(to) {

    // mint - assuming it is deposit action
    if (from == address(0)) {
      // new deposit
      if (userBoostTs[to] == 0) {
        userBoostTs[to] = block.timestamp;
      }
    } else if (to == address(0)) {
      // burn - assuming it is withdraw action
      // no action required
    } else {
      // regular transfer
      // if recipient didn't have deposit - start boost time
      if (userBoostTs[to] == 0) {
        userBoostTs[to] = block.timestamp;
      }
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
    uint256 wantInvestInTotal = underlyingBalanceWithInvestment();
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
  function _withdraw(uint256 numberOfShares) internal updateRewards(msg.sender) {
    require(totalSupply() > 0, "no shares");
    require(numberOfShares > 0, "zero amount");

    userLastWithdrawTs[msg.sender] = block.timestamp;

    uint256 totalSupply = totalSupply();
    _burn(msg.sender, numberOfShares);

    // only statistic, no funds affected
    try IBookkeeper(IController(controller()).bookkeeper())
    .registerUserAction(msg.sender, numberOfShares, false) {
    } catch {}

    uint256 underlyingAmountToWithdraw = underlyingBalanceWithInvestment()
    .mul(numberOfShares)
    .div(totalSupply);
    if (underlyingAmountToWithdraw > underlyingBalanceInVault()) {
      // withdraw everything from the strategy to accurately check the share value
      if (numberOfShares == totalSupply) {
        IStrategy(strategy()).withdrawAllToVault();
      } else {
        uint256 missing = underlyingAmountToWithdraw.sub(underlyingBalanceInVault());
        IStrategy(strategy()).withdrawToVault(missing);
      }
      // recalculate to improve accuracy
      underlyingAmountToWithdraw = MathUpgradeable.min(underlyingBalanceWithInvestment()
      .mul(numberOfShares)
      .div(totalSupply), underlyingBalanceInVault());
    }

    IERC20Upgradeable(underlying()).safeTransfer(msg.sender, underlyingAmountToWithdraw);

    // update the withdrawal amount for the holder
    emit Withdraw(msg.sender, underlyingAmountToWithdraw);
  }

  /// @notice Mint shares and transfer underlying from user to the vault
  ///         New shares = (invested amount * total supply) / underlyingBalanceWithInvestment()
  function _deposit(uint256 amount, address sender, address beneficiary) internal updateRewards(sender) {
    require(amount > 0, "zero amount");
    require(beneficiary != address(0), "zero beneficiary");

    uint256 toMint = totalSupply() == 0
    ? amount
    : amount.mul(totalSupply()).div(underlyingBalanceWithInvestment());
    _mint(beneficiary, toMint);

    IERC20Upgradeable(underlying()).safeTransferFrom(sender, address(this), amount);

    // only statistic, no funds affected
    IBookkeeper(IController(controller()).bookkeeper())
    .registerUserAction(beneficiary, toMint, true);

    emit Deposit(beneficiary, amount);
  }

  /// @notice Transfer underlying to the strategy
  function invest() internal whenStrategyDefined {
    uint256 availableAmount = availableToInvestOut();
    if (availableAmount > 0) {
      IERC20Upgradeable(underlying()).safeTransfer(address(strategy()), availableAmount);
      IStrategy(strategy()).investAllUnderlying();
      emit Invest(availableAmount);
    }
  }

  //**************** REWARDS FUNCTIONALITY ***********************

  function _vaultController() internal view returns (IVaultController){
    return IVaultController(IController(controller()).vaultController());
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
    if (totalSupply() == 0) {
      return rewardPerTokenStoredForToken[rt];
    }
    return
    rewardPerTokenStoredForToken[rt].add(
      lastTimeRewardApplicable(rt)
      .sub(lastUpdateTimeForToken[rt])
      .mul(rewardRateForToken[rt])
      .mul(1e18)
      .div(totalSupply())
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
  function notifyTargetRewardAmount(address _rewardToken, uint256 amount)
  external override
  updateRewards(address(0))
  onlyRewardDistribution
  {
    // overflow fix according to https://sips.synthetix.io/sips/sip-77
    require(amount < type(uint256).max / 1e18, "amount overflow");
    uint256 i = getRewardTokenIndex(_rewardToken);
    require(i != type(uint256).max, "rt not found");

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
    require(rewardRateForToken[_rewardToken] <= balance.div(duration()), "Provided reward too high");
    emit RewardAdded(_rewardToken, amount);
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
      if (boostStart != 0 && boostStart < block.timestamp) {
        uint256 currentBoostDuration = block.timestamp.sub(boostStart);
        // not 100% boost
        uint256 boostDuration = _vaultController().rewardBoostDuration();
        uint256 rewardRatioWithoutBoost = _vaultController().rewardRatioWithoutBoost();
        if (currentBoostDuration < boostDuration) {
          uint256 rewardWithoutBoost = reward.mul(rewardRatioWithoutBoost).div(100);
          // calculate boosted part of rewards
          uint256 toClaim = rewardWithoutBoost.add(
            reward.sub(rewardWithoutBoost).mul(currentBoostDuration).div(boostDuration)
          );
          uint256 change = reward.sub(toClaim);
          reward = toClaim;

          notifyRewardWithoutPeriodChange(change, rt);
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
  function notifyRewardWithoutPeriodChange(uint256 _amount, address _rewardToken) internal {
    if (_amount > 1 && _amount < type(uint256).max / 1e18) {
      rewardPerTokenStoredForToken[_rewardToken] = rewardPerToken(_rewardToken);
      lastUpdateTimeForToken[_rewardToken] = lastTimeRewardApplicable(_rewardToken);
      if (block.timestamp >= periodFinishForToken[_rewardToken]) {
        // if vesting ended transfer the change to the controller
        // otherwise we will have possible infinity rewards duration
        IERC20Upgradeable(_rewardToken).safeTransfer(controller(), _amount);
      } else {
        uint256 remaining = periodFinishForToken[_rewardToken].sub(block.timestamp);
        uint256 leftover = remaining.mul(rewardRateForToken[_rewardToken]);
        rewardRateForToken[_rewardToken] = _amount.add(leftover).div(remaining);
      }
    }
  }

  /// @notice Disable strategy and move rewards to controller
  function stop() external override onlyVaultController {
    IStrategy(strategy()).withdrawAllToVault();
    _setActive(false);

    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      address rt = _rewardTokens[i];
      periodFinishForToken[rt] = block.timestamp;
      rewardRateForToken[rt] = 0;
      lastUpdateTimeForToken[rt] = 0;
      rewardPerTokenStoredForToken[rt] = 0;
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
  function setStrategy(address _strategy) external override onlyController {
    require(_strategy != address(0), "zero strat");
    require(IStrategy(_strategy).underlying() == address(underlying()), "wrong underlying");
    require(IStrategy(_strategy).vault() == address(this), "wrong strat vault");

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
