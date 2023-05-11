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

import "../openzeppelin/SafeMath.sol";
import "../base/governance/ControllableV2.sol";
import "../base/interfaces/IBookkeeper.sol";
import "../base/interfaces/ISmartVault.sol";
import "../base/interfaces/IVaultController.sol";
import "../base/interfaces/IStrategy.sol";
import "../base/interfaces/IStrategySplitter.sol";
import "../infrastructure/price/IPriceCalculator.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/Math.sol";
import "../third_party/IERC20Extended.sol";
import "../openzeppelin/IERC4626.sol";

/// @title View data reader for using on website UI and other integrations
/// @author belbix
contract ContractReader is Initializable, ControllableV2 {
  using SafeMath for uint256;

  string public constant VERSION = "1.1.2";
  uint256 constant public PRECISION = 1e18;
  mapping(bytes32 => address) internal tools;

  function initialize(address _controller, address _calculator) external initializer {
    ControllableV2.initializeControllable(_controller);
    tools[keccak256(abi.encodePacked("calculator"))] = _calculator;
  }

  /// @dev Allow operation only for Controller or Governance
  modifier onlyControllerOrGovernance() {
    require(_isController(msg.sender) || _isGovernance(msg.sender), "Not controller or gov");
    _;
  }

  event ToolAddressUpdated(address newValue);

  struct VaultInfo {
    address addr;
    string name;
    uint256 created;
    bool active;
    uint256 tvl;
    uint256 tvlUsdc;
    uint256 decimals;
    address underlying;
    address[] rewardTokens;
    uint256[] rewardTokensBal;
    uint256[] rewardTokensBalUsdc;
    uint256 duration;
    uint256[] rewardsApr;
    uint256 ppfsApr;
    uint256 users;

    // strategy
    address strategy;
    uint256 strategyCreated;
    IStrategy.Platform platform;
    address[] assets;
    address[] strategyRewards;
    bool strategyOnPause;
    uint256 earned;
  }

  struct VaultInfoLight {
    address addr;
    uint256 created;
    bool active;
    uint256 tvl;
    uint256 tvlUsdc;
    address underlying;
    address[] rewardTokens;
    uint256[] rewardsApr;
    uint256 ppfsApr;
    IStrategy.Platform platform;
    address[] assets;
    uint256 earned;
  }

  struct UserInfo {
    address wallet;
    address vault;
    uint256 underlyingBalance;
    uint256 underlyingBalanceUsdc;
    uint256 depositedUnderlying;
    uint256 depositedUnderlyingUsdc;
    uint256 depositedShare;
    address[] rewardTokens;
    uint256[] rewards;
    uint256[] rewardsUsdc;
    uint256[] rewardsBoost;
    uint256[] rewardsBoostUsdc;
  }

  struct UserInfoLight {
    uint256 depositedUnderlying;
    uint256 depositedUnderlyingUsdc;
    uint256 depositedShare;
  }

  struct VaultWithUserInfo {
    VaultInfo vault;
    UserInfo user;
  }

  struct VaultWithUserInfoLight {
    VaultInfoLight vault;
    UserInfoLight user;
  }

  // **************************************************************
  // HEAVY QUERIES
  //***************************************************************

  function vaultInfo(address vault) public view returns (VaultInfo memory) {
    address strategy = ISmartVault(vault).strategy();
    VaultInfo memory v = VaultInfo(
      vault,
      vaultName(vault),
      vaultCreated(vault),
      vaultActive(vault),
      vaultTvl(vault),
      vaultTvlUsdc(vault),
      vaultDecimals(vault),
      vaultUnderlying(vault),
      vaultRewardTokens(vault),
      vaultRewardTokensBal(vault),
      vaultRewardTokensBalUsdc(vault),
      vaultDuration(vault),
      vaultRewardsApr(vault),
      vaultPpfsApr(vault),
      vaultUsers(vault),
      strategy,
      strategyCreated(strategy),
      strategyPlatform(strategy),
      strategyAssets(strategy),
      strategyRewardTokens(strategy),
      strategyPausedInvesting(strategy),
      strategyEarned(strategy)
    );

    return v;
  }

  function vaultInfoLight(address vault) public view returns (VaultInfoLight memory) {
    address strategy = ISmartVault(vault).strategy();
    VaultInfoLight memory v = VaultInfoLight(
      vault,
      vaultCreated(vault),
      vaultActive(vault),
      vaultTvl(vault),
      vaultTvlUsdc(vault),
      vaultUnderlying(vault),
      vaultRewardTokens(vault),
      vaultRewardsApr(vault),
      vaultPpfsApr(vault),
      strategyPlatform(strategy),
      strategyAssets(strategy),
      strategyEarned(strategy)
    );

    return v;
  }

  function vaultInfos(address[] memory _vaults)
  external view returns (VaultInfo[] memory){
    VaultInfo[] memory result = new VaultInfo[](_vaults.length);
    for (uint256 i = 0; i < _vaults.length; i++) {
      result[i] = vaultInfo(_vaults[i]);
    }
    return result;
  }

  function vaultInfosLight(address[] memory _vaults)
  external view returns (VaultInfoLight[] memory){
    VaultInfoLight[] memory result = new VaultInfoLight[](_vaults.length);
    for (uint256 i = 0; i < _vaults.length; i++) {
      result[i] = vaultInfoLight(_vaults[i]);
    }
    return result;
  }

  function userInfo(address _user, address _vault) public view returns (UserInfo memory) {
    address[] memory rewardTokens = ISmartVault(_vault).rewardTokens();
    uint256[] memory rewardsEarned = new uint256[](rewardTokens.length);
    for (uint256 i = 0; i < rewardTokens.length; i++) {
      rewardsEarned[i] = ISmartVault(_vault).earned(rewardTokens[i], _user);
    }
    return UserInfo(
      _user,
      _vault,
      userUnderlyingBalance(_user, _vault),
      userUnderlyingBalanceUsdc(_user, _vault),
      userDepositedUnderlying(_user, _vault),
      userDepositedUnderlyingUsdc(_user, _vault),
      userDepositedShare(_user, _vault),
      rewardTokens,
      userRewards(_user, _vault),
      userRewardsUsdc(_user, _vault),
      userRewardsBoost(_user, _vault),
      userRewardsBoostUsdc(_user, _vault)
    );
  }

  function userInfoLight(address _user, address _vault) public view returns (UserInfoLight memory) {
    return UserInfoLight(
      userDepositedUnderlying(_user, _vault),
      userDepositedUnderlyingUsdc(_user, _vault),
      userDepositedShare(_user, _vault)
    );
  }

  function userInfosLight(address _user, address[] memory _vaults)
  external view returns (UserInfoLight[] memory) {
    UserInfoLight[] memory result = new UserInfoLight[](_vaults.length);
    for (uint256 i = 0; i < _vaults.length; i++) {
      result[i] = userInfoLight(_user, _vaults[i]);
    }
    return result;
  }


  function vaultWithUserInfos(address _user, address[] memory _vaults)
  external view returns (VaultWithUserInfo[] memory){
    VaultWithUserInfo[] memory result = new VaultWithUserInfo[](_vaults.length);
    for (uint256 i = 0; i < _vaults.length; i++) {
      result[i] = VaultWithUserInfo(
        vaultInfo(_vaults[i]),
        userInfo(_user, _vaults[i])
      );
    }
    return result;
  }

  function vaultWithUserInfosLight(address _user, address[] memory _vaults)
  external view returns (VaultWithUserInfoLight[] memory){
    VaultWithUserInfoLight[] memory result = new VaultWithUserInfoLight[](_vaults.length);
    for (uint256 i = 0; i < _vaults.length; i++) {
      result[i] = VaultWithUserInfoLight(
        vaultInfoLight(_vaults[i]),
        userInfoLight(_user, _vaults[i])
      );
    }
    return result;
  }

  function vaultWithUserInfoPages(address _user, uint256 page, uint256 pageSize)
  external view returns (VaultWithUserInfo[] memory){

    uint256 size = vaults().length;
    require(size > 0, "empty vaults");

    uint256 totalPages = size / pageSize;
    if (totalPages * pageSize < size) {
      totalPages++;
    }

    if (page > totalPages) {
      page = totalPages;
    }

    uint256 start = Math.min(page * pageSize, size - 1);
    uint256 end = Math.min((start + pageSize), size);
    VaultWithUserInfo[] memory result = new VaultWithUserInfo[](end - start);
    for (uint256 i = start; i < end; i++) {
      result[i - start] = VaultWithUserInfo(
        vaultInfo(vaults()[i]),
        userInfo(_user, vaults()[i])
      );
    }
    return result;
  }

  function vaultWithUserInfoPagesLight(address _user, uint256 page, uint256 pageSize)
  external view returns (VaultWithUserInfoLight[] memory){

    uint256 size = vaults().length;
    require(size > 0, "empty vaults");

    uint256 totalPages = size / pageSize;
    if (totalPages * pageSize < size) {
      totalPages++;
    }

    if (page > totalPages) {
      page = totalPages;
    }

    uint256 start = Math.min(page * pageSize, size - 1);
    uint256 end = Math.min((start + pageSize), size);
    VaultWithUserInfoLight[] memory result = new VaultWithUserInfoLight[](end - start);
    for (uint256 i = start; i < end; i++) {
      result[i - start] = VaultWithUserInfoLight(
        vaultInfoLight(vaults()[i]),
        userInfoLight(_user, vaults()[i])
      );
    }
    return result;
  }

  function tetuTokenValues() external view returns (uint256[] memory){
    uint256 price = getPrice(IController(_controller()).rewardToken());
    uint256 mCap = IERC20(IController(_controller()).rewardToken()).totalSupply()
    .mul(price).div(1e18);

    uint256[] memory result = new uint256[](2);
    result[0] = price;
    result[1] = mCap;
    return result;
  }

  function totalTvlUsdc(address[] memory _vaults) external view returns (uint256) {
    uint256 result = 0;
    for (uint256 i = 0; i < _vaults.length; i++) {
      result += vaultTvlUsdc(_vaults[i]);
    }
    return result;
  }

  function totalTetuBoughBack(address[] memory _vaults) external view returns (uint256) {
    uint256 result = 0;
    for (uint256 i = 0; i < _vaults.length; i++) {
      result += strategyEarned(ISmartVault(_vaults[i]).strategy());
    }
    return result;
  }

  function totalTetuBoughBack2(address[] memory _strategies) external view returns (uint256) {
    uint256 result = 0;
    for (uint256 i = 0; i < _strategies.length; i++) {
      result += strategyEarned(_strategies[i]);
    }
    return result;
  }

  function totalUsers(address[] memory _vaults) external view returns (uint256) {
    uint256 result = 0;
    for (uint256 i = 0; i < _vaults.length; i++) {
      result += vaultUsers(_vaults[i]);
    }
    return result;
  }

  function totalUsersForAllVaults() external view returns (uint256) {
    address[] memory _vaults = vaults();
    uint256 result = 0;
    for (uint256 i = 0; i < _vaults.length; i++) {
      result += vaultUsers(_vaults[i]);
    }
    return result;
  }

  // ********************** FIELDS ***********************

  // no decimals
  function vaultUsers(address _vault) public view returns (uint256){
    return IBookkeeper(bookkeeper()).vaultUsersQuantity(_vault);
  }

  function vaultName(address _vault) public view returns (string memory){
    return IERC20Extended(_vault).name();
  }

  function vaultPlatform(address _vault) public view returns (IStrategy.Platform){
    return IStrategy(ISmartVault(_vault).strategy()).platform();
  }

  // no decimals
  function vaultCreated(address _vault) public view returns (uint256){
    return ControllableV2(_vault).created();
  }

  function vaultActive(address _vault) public view returns (bool){
    return ISmartVault(_vault).active();
  }

  // normalized precision
  function vaultTvl(address _vault) public view returns (uint256){
    return normalizePrecision(ISmartVault(_vault).underlyingBalanceWithInvestment(), vaultDecimals(_vault));
  }

  // normalized precision
  function vaultTvlUsdc(address _vault) public view returns (uint256){
    uint256 underlyingPrice = getPrice(vaultUnderlying(_vault));
    return vaultTvl(_vault).mul(underlyingPrice).div(PRECISION);
  }

  // normalized precision
  function vaultERC2626TvlUsdc(address _vault) public view returns (uint256){
    uint256 underlyingPrice = getPrice(IERC4626(_vault).asset());
    return normalizePrecision(IERC4626(_vault).totalAssets(), IERC4626(_vault).decimals()) * underlyingPrice / PRECISION;
  }

  function vaultDecimals(address _vault) public view returns (uint256){
    return uint256(IERC20Extended(_vault).decimals());
  }

  function vaultUnderlying(address _vault) public view returns (address){
    return ISmartVault(_vault).underlying();
  }

  // no decimals
  function vaultDuration(address _vault) public view returns (uint256){
    return ISmartVault(_vault).duration();
  }

  function vaultRewardTokens(address _vault) public view returns (address[] memory){
    return ISmartVault(_vault).rewardTokens();
  }

  // normalized precision
  function vaultRewardTokensBal(address _vault) public view returns (uint256[] memory){
    uint256[] memory result = new uint256[](vaultRewardTokens(_vault).length);
    for (uint256 i = 0; i < vaultRewardTokens(_vault).length; i++) {
      address rt = vaultRewardTokens(_vault)[i];
      result[i] = normalizePrecision(IERC20(rt).balanceOf(_vault), IERC20Extended(rt).decimals());
    }
    return result;
  }

  // normalized precision
  function vaultRewardTokensBalUsdc(address _vault) public view returns (uint256[] memory){
    uint256[] memory result = new uint256[](vaultRewardTokens(_vault).length);
    for (uint256 i = 0; i < vaultRewardTokens(_vault).length; i++) {
      address rt = vaultRewardTokens(_vault)[i];
      uint256 rtPrice = getPrice(rt);
      uint256 bal = IERC20(rt).balanceOf(_vault).mul(rtPrice).div(PRECISION);
      result[i] = normalizePrecision(bal, IERC20Extended(rt).decimals());
    }
    return result;
  }

  // normalized precision
  function vaultRewardsApr(address _vault) public view returns (uint256[] memory){
    ISmartVault vault = ISmartVault(_vault);
    uint256[] memory result = new uint256[](vault.rewardTokens().length);
    for (uint256 i = 0; i < vault.rewardTokens().length; i++) {
      result[i] = computeRewardApr(_vault, vault.rewardTokens()[i]);
    }
    return result;
  }

  // normalized precision
  function computeRewardApr(address _vault, address rt) public view returns (uint256) {
    uint256 periodFinish = ISmartVault(_vault).periodFinishForToken(rt);
    // already normalized precision
    uint256 tvlUsd = vaultTvlUsdc(_vault);
    uint256 rtPrice = getPrice(rt);

    uint256 rewardsForFullPeriod = ISmartVault(_vault).rewardRateForToken(rt)
    .mul(ISmartVault(_vault).duration());

    // keep precision numbers
    if (tvlUsd != 0 && rewardsForFullPeriod != 0 && periodFinish > block.timestamp) {
      uint256 currentPeriod = periodFinish.sub(block.timestamp);
      uint256 periodRatio = currentPeriod.mul(PRECISION).div(ISmartVault(_vault).duration());

      uint256 rtBalanceUsd = rewardsForFullPeriod
      .mul(periodRatio)
      .mul(rtPrice)
      .div(1e36);

      // amounts should have the same decimals
      rtBalanceUsd = normalizePrecision(rtBalanceUsd, IERC20Extended(rt).decimals());

      return computeApr(tvlUsd, rtBalanceUsd, currentPeriod);
    } else {
      return 0;
    }
  }

  // https://www.investopedia.com/terms/a/apr.asp
  // TVL and rewards should be in the same currency and with the same decimals
  function computeApr(uint256 tvl, uint256 rewards, uint256 duration) public pure returns (uint256) {
    if (tvl == 0 || duration == 0) {
      return 0;
    }
    uint256 rewardsPerTvlRatio = rewards.mul(PRECISION).div(tvl).mul(PRECISION);
    return rewardsPerTvlRatio.mul(PRECISION).div(duration.mul(PRECISION).div(1 days))
    .mul(uint256(365)).mul(uint256(100)).div(PRECISION);
  }

  // normalized precision
  function vaultPpfs(address _vault) public view returns (uint256){
    return normalizePrecision(ISmartVault(_vault).getPricePerFullShare(), vaultDecimals(_vault));
  }

  // normalized precision
  function vaultPpfsApr(address _vault) public view returns (uint256){
    return normalizePrecision(computePpfsApr(
        ISmartVault(_vault).getPricePerFullShare(),
        10 ** vaultDecimals(_vault),
        block.timestamp,
        vaultCreated(_vault)
      ), vaultDecimals(_vault));
  }

  // it is an experimental metric and shows very volatile value
  // normalized precision
  function vaultPpfsLastApr(address _vault) external view returns (uint256){
    IBookkeeper.PpfsChange memory lastPpfsChange = IBookkeeper(bookkeeper()).lastPpfsChange(_vault);
    // skip fresh vault
    if (lastPpfsChange.time == 0) {
      return 0;
    }
    return normalizePrecision(computePpfsApr(
        lastPpfsChange.value,
        lastPpfsChange.oldValue,
        lastPpfsChange.time,
        lastPpfsChange.oldTime
      ), vaultDecimals(_vault));
  }

  function computePpfsApr(uint256 ppfs, uint256 startPpfs, uint256 curTime, uint256 startTime)
  internal pure returns (uint256) {
    if (ppfs <= startPpfs) {
      return 0;
    }
    uint256 ppfsChange = ppfs.sub(startPpfs);
    uint256 timeChange = Math.max(curTime.sub(startTime), 1);
    if (timeChange == 0) {
      return 0;
    }
    return ppfsChange.mul(PRECISION).div(timeChange)
    .mul(uint256(1 days * 365)).mul(uint256(100)).div(PRECISION);
  }

  // no decimals
  function strategyCreated(address _strategy) public view returns (uint256){
    return ControllableV2(_strategy).created();
  }

  function strategyPlatform(address _strategy) public view returns (IStrategy.Platform){
    return IStrategy(_strategy).platform();
  }

  function strategyAssets(address _strategy) public view returns (address[] memory){
    return IStrategy(_strategy).assets();
  }

  function strategyRewardTokens(address _strategy) public view returns (address[] memory){
    if (IStrategy(_strategy).platform() == IStrategy.Platform.STRATEGY_SPLITTER) {
      return IStrategySplitter(_strategy).strategyRewardTokens();
    }
    return IStrategy(_strategy).rewardTokens();
  }

  function strategyPausedInvesting(address _strategy) public view returns (bool){
    return IStrategy(_strategy).pausedInvesting();
  }

  // normalized precision
  function strategyEarned(address _strategy) public view returns (uint256){
    address targetToken = IController(_controller()).rewardToken();
    return normalizePrecision(
      IBookkeeper(bookkeeper()).targetTokenEarned(_strategy),
      IERC20Extended(targetToken).decimals()
    );
  }

  // normalized precision
  function userUnderlyingBalance(address _user, address _vault) public view returns (uint256) {
    return normalizePrecision(IERC20(vaultUnderlying(_vault)).balanceOf(_user), vaultDecimals(_vault));
  }

  // normalized precision
  function userUnderlyingBalanceUsdc(address _user, address _vault) public view returns (uint256) {
    uint256 underlyingPrice = getPrice(_vault);
    return userUnderlyingBalance(_user, _vault).mul(underlyingPrice).div(PRECISION);
  }

  // normalized precision
  function userDepositedUnderlying(address _user, address _vault) public view returns (uint256) {
    return normalizePrecision(
      ISmartVault(_vault).underlyingBalanceWithInvestmentForHolder(_user),
      vaultDecimals(_vault)
    );
  }

  function userDepositedUnderlyingUsdc(address _user, address _vault)
  public view returns (uint256) {
    uint256 underlyingPrice = getPrice(vaultUnderlying(_vault));
    return userDepositedUnderlying(_user, _vault).mul(underlyingPrice).div(PRECISION);
  }

  // normalized precision
  function userDepositedShare(address _user, address _vault) public view returns (uint256) {
    return normalizePrecision(IERC20(_vault).balanceOf(_user), vaultDecimals(_vault));
  }

  // normalized precision
  function userRewards(address _user, address _vault) public view returns (uint256[] memory) {
    address[] memory rewardTokens = ISmartVault(_vault).rewardTokens();
    uint256[] memory rewards = new uint256[](rewardTokens.length);
    for (uint256 i = 0; i < rewardTokens.length; i++) {
      rewards[i] = normalizePrecision(
        ISmartVault(_vault).earned(rewardTokens[i], _user),
        IERC20Extended(rewardTokens[i]).decimals()
      );
    }
    return rewards;
  }

  // normalized precision
  function userRewardsBoost(address _user, address _vault) public view returns (uint256[] memory) {
    address[] memory rewardTokens = ISmartVault(_vault).rewardTokens();
    uint256[] memory rewards = new uint256[](rewardTokens.length);
    for (uint256 i = 0; i < rewardTokens.length; i++) {
      rewards[i] = normalizePrecision(
        ISmartVault(_vault).earnedWithBoost(rewardTokens[i], _user),
        IERC20Extended(rewardTokens[i]).decimals()
      );
    }
    return rewards;
  }

  // normalized precision
  function userRewardsUsdc(address _user, address _vault) public view returns (uint256[] memory) {
    address[] memory rewardTokens = ISmartVault(_vault).rewardTokens();
    uint256[] memory rewards = new uint256[](rewardTokens.length);
    for (uint256 i = 0; i < rewardTokens.length; i++) {
      uint256 price = getPrice(rewardTokens[i]);
      rewards[i] = normalizePrecision(
        ISmartVault(_vault).earned(rewardTokens[i], _user).mul(price).div(PRECISION),
        IERC20Extended(rewardTokens[i]).decimals()
      );
    }
    return rewards;
  }

  // normalized precision
  function userRewardsBoostUsdc(address _user, address _vault) public view returns (uint256[] memory) {
    address[] memory rewardTokens = ISmartVault(_vault).rewardTokens();
    uint256[] memory rewards = new uint256[](rewardTokens.length);
    for (uint256 i = 0; i < rewardTokens.length; i++) {
      uint256 price = getPrice(rewardTokens[i]);
      rewards[i] = normalizePrecision(
        ISmartVault(_vault).earnedWithBoost(rewardTokens[i], _user).mul(price).div(PRECISION),
        IERC20Extended(rewardTokens[i]).decimals()
      );
    }
    return rewards;
  }

  function vaults() public view returns (address[] memory){
    return IBookkeeper(bookkeeper()).vaults();
  }

  function vaultsLength() public view returns (uint256){
    return IBookkeeper(bookkeeper()).vaults().length;
  }

  function strategies() public view returns (address[] memory){
    return IBookkeeper(bookkeeper()).strategies();
  }

  function strategiesLength() public view returns (uint256){
    return IBookkeeper(bookkeeper()).strategies().length;
  }

  function priceCalculator() public view returns (address) {
    return tools[keccak256(abi.encodePacked("calculator"))];
  }

  function bookkeeper() public view returns (address) {
    return IController(_controller()).bookkeeper();
  }

  // normalized precision
  //noinspection NoReturn
  function getPrice(address _token) public view returns (uint256) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IPriceCalculator(priceCalculator()).getPriceWithDefaultOutput(_token) returns (uint256 price){
      return price;
    } catch {
      return 0;
    }
  }

  function normalizePrecision(uint256 amount, uint256 decimals) internal pure returns (uint256) {
    if (decimals == 0) {
      return 0;
    }
    return amount.mul(PRECISION).div(10 ** decimals);
  }

  // *********** GOVERNANCE ACTIONS *****************

  function setPriceCalculator(address newValue) external onlyControllerOrGovernance {
    tools[keccak256(abi.encodePacked("calculator"))] = newValue;
    emit ToolAddressUpdated(newValue);
  }

}
