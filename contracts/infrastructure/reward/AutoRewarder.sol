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

import "../../base/governance/ControllableV2.sol";
import "../../base/interfaces/ISmartVault.sol";
import "../../base/interfaces/IStrategy.sol";
import "../../base/interfaces/IController.sol";
import "./IRewardCalculator.sol";
import "../../base/interfaces/IRewardToken.sol";
import "./AutoRewarderStorage.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/Math.sol";

/// @title Calculate recommended reward amount for vaults and distribute it
/// @dev Use with TetuProxyGov
/// @author belbix
contract AutoRewarder is ControllableV2, AutoRewarderStorage {
  using SafeERC20 for IERC20;

  // *********** CONSTANTS ****************
  string public constant VERSION = "1.2.2";
  uint256 public constant PRECISION = 1e18;
  uint256 public constant NETWORK_RATIO_DENOMINATOR = 1e18;

  // *********** EVENTS *******************
  event TokenMoved(address token, uint256 amount);
  event NetworkRatioChanged(uint256 value);
  event RewardPerDayChanged(uint256 value);
  event PeriodChanged(uint256 value);
  event ResetCycle(uint256 lastDistributedId, uint256 distributed);
  event DistributedTetu(address vault, uint256 toDistribute);
  event PlatformStatusChanged(uint256 platform, bool status);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  function initialize(
    address _controller,
    address _rewardCalculator,
    uint _networkRatio,
    uint _rewardPerDay,
    uint _period
  ) external initializer {
    ControllableV2.initializeControllable(_controller);
    AutoRewarderStorage.initializeAutoRewarderStorage(
      _rewardCalculator,
      _networkRatio,
      _rewardPerDay,
      _period
    );
  }

  /// @dev Allow operation only for Controller or Governance
  modifier onlyControllerOrGovernance() {
    require(_isController(msg.sender) || _isGovernance(msg.sender), "Not controller or gov");
    _;
  }

  /// @dev Only Reward Distributor allowed. Governance is Reward Distributor by default.
  modifier onlyRewardDistribution() {
    require(IController(_controller()).isRewardDistributor(msg.sender), "Only reward distributor");
    _;
  }

  // *********** VIEWS ********************
  function psVault() public view returns (address) {
    return IController(_controller()).psVault();
  }

  function tetuToken() public view returns (IRewardToken) {
    return IRewardToken(IController(_controller()).rewardToken());
  }

  function vaultsSize() external view returns (uint256) {
    return vaults.length;
  }

  /// @dev Capacity for daily distribution. Calculates based on TETU vesting logic
  function maxRewardsPerPeriod() public view virtual returns (uint256) {
    return (_maxSupplyPerWeek(tetuToken().currentWeek())
    - _maxSupplyPerWeek(tetuToken().currentWeek() - 1))
    * networkRatio() / (7 days / period()) / NETWORK_RATIO_DENOMINATOR;
  }

  // ********* GOV ACTIONS ****************

  /// @dev Set network ratio
  function setNetworkRatio(uint256 _value) external onlyControllerOrGovernance {
    require(_value <= NETWORK_RATIO_DENOMINATOR, "AR: Wrong ratio");
    _setNetworkRatio(_value);
    emit NetworkRatioChanged(_value);
  }

  /// @dev Set rewards amount for daily distribution
  function setRewardPerPeriod(uint256 _value) external onlyControllerOrGovernance {
    require(_value <= maxRewardsPerPeriod(), "AR: Rewards per day too high");
    _setRewardsPerDay(_value);
    emit RewardPerDayChanged(_value);
  }

  /// @dev Set rewards period. Assume to be 1 week.
  function setPeriod(uint256 _value) external onlyControllerOrGovernance {
    _setPeriod(_value);
    emit PeriodChanged(_value);
  }

  /// @dev Move tokens to controller where money will be protected with time lock
  function withdraw(address _token, uint256 amount) external onlyControllerOrGovernance {
    uint256 tokenBalance = IERC20(_token).balanceOf(address(this));
    require(tokenBalance >= amount, "AR: Not enough balance");
    IERC20(_token).safeTransfer(msg.sender, amount);
    emit TokenMoved(_token, amount);
  }

  function changePlatformStatus(uint256[] calldata _platforms, bool _status) external onlyControllerOrGovernance {
    for (uint i; i < _platforms.length; i++) {
      excludedPlatforms[_platforms[i]] = _status;
      emit PlatformStatusChanged(_platforms[i], _status);
    }
  }

  // ************** CLEAR FOR RESET THIS CONTRACT ********************

  function clearVaultsFull() external onlyControllerOrGovernance {
    uint length = vaults.length;
    for (uint i; i < length; i++) {
      address vault = vaults[i];
      delete lastInfo[vault];
      delete lastDistributionTs[vault];
      delete lastDistributedAmount[vault];
    }
    delete vaults;
    _setTotalStrategyRewards(0);
    _setLastDistributedId(0);
    _setDistributed(0);
  }

  /// @dev Once called should be done for all vaults!
  function clearVaultsInfo(address[] memory vaults_) external onlyControllerOrGovernance {
    for (uint i; i < vaults_.length; i++) {
      delete lastInfo[vaults_[i]];
      delete lastDistributionTs[vaults_[i]];
      delete lastDistributedAmount[vaults_[i]];
    }
  }

  /// @dev Must be called after clearing info!
  function clearVaults() external onlyControllerOrGovernance {
    delete vaults;
    _setTotalStrategyRewards(0);
    _setLastDistributedId(0);
    _setDistributed(0);
  }

  // ********* DISTRIBUTOR ACTIONS ****************

  /// @dev Manual reset. In normal circumstances rest calls in the end of cycle
  function reset() external onlyRewardDistribution {
    _reset();
  }

  /// @dev Distribute rewards for given amount of vaults. Start with lastDistributedId
  function distribute(uint256 count) external onlyRewardDistribution {
    uint256 from = lastDistributedId();
    uint256 to = Math.min(from + count, vaults.length);
    for (uint256 i = from; i < to; i++) {
      _distribute(vaults[i]);
    }
    _setLastDistributedId(to);
    if (lastDistributedId() == vaults.length) {
      _reset();
    }
  }

  /// @dev Fetch information and store for further distributions.
  ///      This process has unpredictable gas cost and should be made as independent transactions
  ///      Only after updating information a vault can be rewarded
  function collectAndStoreInfo(address[] memory _vaults) external onlyRewardDistribution {
    IRewardCalculator rc = IRewardCalculator(rewardCalculator());
    for (uint256 i = 0; i < _vaults.length; i++) {
      if (!ISmartVault(_vaults[i]).active()) {
        continue;
      }
      RewardInfo memory info = lastInfo[_vaults[i]];
      require(block.timestamp - info.time > period(), "AR: Info too young");

      uint256 rewards = rc.strategyRewardsUsd(ISmartVault(_vaults[i]).strategy(), period());

      // new vault
      if (info.vault == address(0)) {
        vaults.push(_vaults[i]);
      } else {
        _setTotalStrategyRewards(totalStrategyRewards() - info.strategyRewardsUsd);
      }
      _setTotalStrategyRewards(totalStrategyRewards() + rewards);
      lastInfo[_vaults[i]] = RewardInfo(_vaults[i], block.timestamp, rewards);
    }
  }

  /// @dev Store rewards information without calling reward calculator
  function storeInfo(address[] memory _vaults, uint[] memory _strategyRewards) external onlyRewardDistribution {
    require(_vaults.length == _strategyRewards.length, "AR: Wrong arrays");
    for (uint256 i = 0; i < _vaults.length; i++) {
      RewardInfo memory info = lastInfo[_vaults[i]];
      require(block.timestamp - info.time > period(), "AR: Info too young");

      uint256 rewards = _strategyRewards[i];
      // new vault
      if (info.vault == address(0)) {
        vaults.push(_vaults[i]);
      } else {
        _setTotalStrategyRewards(totalStrategyRewards() - info.strategyRewardsUsd);
      }
      _setTotalStrategyRewards(totalStrategyRewards() + rewards);
      lastInfo[_vaults[i]] = RewardInfo(_vaults[i], block.timestamp, rewards);
    }
  }

  // ************* INTERNAL ********************************

  /// @dev Calculate distribution amount and notify given vault
  function _distribute(address _vault) internal {
    if (!ISmartVault(_vault).active()
    || excludedPlatforms[uint256(IStrategy(ISmartVault(_vault).strategy()).platform())]) {
      return;
    }
    RewardInfo memory info = lastInfo[_vault];
    require(info.vault == _vault, "AR: Info not found");
    require(block.timestamp - info.time < period(), "AR: Info too old");
    require(block.timestamp - lastDistributionTs[_vault] > period(), "AR: Too early");
    require(distributed() < rewardsPerDay(), "AR: Distributed too much");
    require(rewardsPerDay() <= maxRewardsPerPeriod(), "AR: Rewards per day too high");
    require(totalStrategyRewards() != 0, "AR: Zero total rewards");

    if (info.strategyRewardsUsd == 0) {
      return;
    }

    uint256 toDistribute = rewardsPerDay() * info.strategyRewardsUsd / totalStrategyRewards();
    lastDistributionTs[_vault] = block.timestamp;
    lastDistributedAmount[_vault] = toDistribute;

    notifyVaultWithTetuToken(toDistribute, _vault);
    _setDistributed(distributed() + toDistribute);
    emit DistributedTetu(_vault, toDistribute);
  }

  /// @dev Deposit TETU tokens to PS and notify given vault
  function notifyVaultWithTetuToken(uint256 _amount, address _vault) internal {
    require(_vault != psVault(), "AR: PS forbidden");
    require(_amount != 0, "AR: Zero amount to notify");

    address[] memory rts = ISmartVault(_vault).rewardTokens();
    require(rts.length > 0, "AR: No reward tokens");
    address rt = rts[0];
    address _tetuToken = ISmartVault(psVault()).underlying();

    uint256 amountToSend;
    if (rt == psVault()) {
      uint rtBalanceBefore = IERC20(psVault()).balanceOf(address(this));
      IERC20(_tetuToken).safeApprove(psVault(), _amount);
      ISmartVault(psVault()).deposit(_amount);
      amountToSend = IERC20(psVault()).balanceOf(address(this)) - rtBalanceBefore;
    } else if (rt == _tetuToken) {
      amountToSend = _amount;
    } else {
      revert("AR: First reward token not TETU nor xTETU");
    }

    IERC20(rt).safeApprove(_vault, 0);
    IERC20(rt).safeApprove(_vault, amountToSend);
    ISmartVault(_vault).notifyTargetRewardAmount(rt, amountToSend);
  }

  /// @dev Reset numbers between cycles
  function _reset() internal {
    emit ResetCycle(lastDistributedId(), distributed());
    _setLastDistributedId(0);
    _setDistributed(0);
  }

  /// @dev Copy of TETU token logic for calculation supply amounts
  function _maxSupplyPerWeek(uint256 currentWeek) internal view returns (uint256){
    uint256 allWeeks = tetuToken().MINTING_PERIOD() / 1 weeks;

    uint256 week = Math.min(allWeeks, currentWeek);

    if (week == 0) {
      return 0;
    }
    if (week >= allWeeks) {
      return tetuToken().HARD_CAP();
    }

    uint256 finalMultiplier = tetuToken()._log2((allWeeks + 1) * PRECISION);

    uint256 baseWeekEmission = tetuToken().HARD_CAP() / finalMultiplier;

    uint256 multiplier = tetuToken()._log2((week + 1) * PRECISION);

    uint256 maxTotalSupply = baseWeekEmission * multiplier;

    return Math.min(maxTotalSupply, tetuToken().HARD_CAP());
  }

}
