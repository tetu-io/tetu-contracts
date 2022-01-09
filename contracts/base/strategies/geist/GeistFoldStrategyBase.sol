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

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../FoldingBase.sol";
import "../../interface/IAveFoldStrategy.sol";
import "../../../third_party/IWmatic.sol";
import "../../../third_party/aave/IAToken.sol";
import "../../../third_party/aave/ILendingPool.sol";
import "../../../third_party/aave/IAaveIncentivesController.sol";
import "../../../third_party/aave/IProtocolDataProvider.sol";
import "../../../third_party/aave/DataTypes.sol";
import "../../../third_party/aave/IPriceOracle.sol";
import "../../../third_party/geist/IMultiFeeDistribution.sol";
import "../../../third_party/geist/IChefIncentivesController.sol";


/// @title Abstract contract for Geist lending strategy implementation with folding functionality
/// @author belbix
/// @author olegn
abstract contract GeistFoldStrategyBase is FoldingBase, IAveFoldStrategy {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @dev precision for the folding profitability calculation
  uint256 private constant _PRECISION = 10 ** 18;
  /// @dev precision for the RAY values e.g currentLiquidityRate value
  uint256 private constant _RAY_PRECISION = 10 ** 27;
  /// @dev approximate number of seconds per year
  uint256 private constant _SECONDS_PER_YEAR = 365 days;
  /// @dev approximate 1 month - default time period for profitability forecast
  uint256 private constant _PROFITABILITY_PERIOD = 30 days;
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "GeistFoldStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.2.0";
  /// @dev How much rewards will be used for distribution process
  uint256 private constant _BUY_BACK_RATIO = _BUY_BACK_DENOMINATOR / 10;
  /// @dev 2 is Variable
  uint256 private constant INTEREST_RATE_MODE = 2;

  ILendingPool private lPool;
  IProtocolDataProvider private dataProvider;
  ILendingPoolAddressesProvider private lendingPoolAddressesProvider;
  IMultiFeeDistribution private multiFeeDistributor;
  IChefIncentivesController private chef;


  address public networkToken;
  address public lpWithGeist;
  address public override aToken;
  address public override dToken;

  address[] private claimableTokens;

  struct GeistData {
    address networkToken;
    address pool;
    address multiFeeDistributor;
    address dataProvider;
    address addressesProvider;
    address chef;
    address lpWithGeist;
  }

  /// @notice Contract constructor using on strategy implementation
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator,
    GeistData memory _geistData
  ) FoldingBase(
    _controller,
    _underlying,
    _vault,
    __rewardTokens,
    _BUY_BACK_RATIO,
    _borrowTargetFactorNumerator,
    _collateralFactorNumerator
  ) {
    networkToken = _geistData.networkToken;
    lpWithGeist = _geistData.lpWithGeist;
    lPool = ILendingPool(_geistData.pool);
    dataProvider = IProtocolDataProvider(_geistData.dataProvider);
    lendingPoolAddressesProvider = ILendingPoolAddressesProvider(_geistData.addressesProvider);
    multiFeeDistributor = IMultiFeeDistribution(_geistData.multiFeeDistributor);
    chef = IChefIncentivesController(_geistData.chef);

    (aToken,,dToken) = dataProvider.getReserveTokensAddresses(_underlying);
    address _lpt = IAToken(aToken).UNDERLYING_ASSET_ADDRESS();
    require(_lpt == _underlyingToken, "GFS: Wrong underlying");

    claimableTokens.push(aToken);
    claimableTokens.push(dToken);
  }

  /////////////////////////////////////////////
  ////////////BASIC STRATEGY FUNCTIONS/////////
  /////////////////////////////////////////////

  /// @notice Return approximately amount of reward tokens ready to claim in AAVE Lending pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    rewards[0] = chef.claimableReward(address(this), claimableTokens)[0] / 2;
    return rewards;
  }

  /// @notice TVL of the underlying in the aToken contract
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(aToken);
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  ///////////////////////////////////////////////////////////////////////////////////////
  ///////////// internal functions require specific implementation for each platforms ///
  ///////////////////////////////////////////////////////////////////////////////////////

  function _getInvestmentData() internal view override returns (uint256, uint256) {
    (uint256 suppliedUnderlying,,uint256 borrowedUnderlying,,,,,,) = dataProvider.getUserReserveData(_underlyingToken, address(this));
    return (suppliedUnderlying, borrowedUnderlying);
  }

  /// @dev Return true if we can gain profit with folding
  function _isFoldingProfitable() internal view override returns (bool) {
    (uint256 supplyRewards,
    uint256 borrowReward,
    uint256 supplyUnderlyingProfit,
    uint256 debtUnderlyingCost) = _totalRewardPredictionNormalised(_PROFITABILITY_PERIOD);
    uint256 claimableRewards = supplyRewards + borrowReward;
    if (_isAutocompound()) {
      claimableRewards = claimableRewards * (_BUY_BACK_DENOMINATOR - _buyBackRatio) / _BUY_BACK_DENOMINATOR;
    }
    // reduce claimable rewards estimation for keep a gap
    // this gap will be a minimum generated profit otherwise we will do folding for nothing
    claimableRewards = claimableRewards * 95 / 100;
    uint256 foldingProfitPerToken = claimableRewards + supplyUnderlyingProfit;
    return foldingProfitPerToken > debtUnderlyingCost;
  }

  /// @dev Claim distribution rewards
  function _claimReward() internal override {
    chef.claim(address(this), claimableTokens);
    multiFeeDistributor.exit();
  }

  function _supply(uint256 amount) internal override updateSupplyInTheEnd {
    amount = Math.min(IERC20(_underlyingToken).balanceOf(address(this)), amount);
    if (amount > 0) {
      IERC20(_underlyingToken).safeApprove(address(lPool), 0);
      IERC20(_underlyingToken).safeApprove(address(lPool), amount);
      lPool.deposit(_underlyingToken, amount, address(this), 0);
    }
  }

  /// @dev Borrows against the collateral
  function _borrow(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    lPool.borrow(_underlyingToken, amountUnderlying, INTEREST_RATE_MODE, 0, address(this));
  }

  /// @dev Redeem liquidity in underlying
  function _redeemUnderlying(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    amountUnderlying = Math.min(amountUnderlying, _maxRedeem());
    if (amountUnderlying > 0) {
      lPool.withdraw(_underlyingToken, amountUnderlying, address(this));
    }
  }

  /// @dev Repay a loan
  function _repay(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    if (amountUnderlying != 0) {
      IERC20(_underlyingToken).safeApprove(address(lPool), 0);
      IERC20(_underlyingToken).safeApprove(address(lPool), amountUnderlying);
      lPool.repay(_underlyingToken, amountUnderlying, INTEREST_RATE_MODE, address(this));
    }
  }

  /// @dev Redeems the maximum amount of underlying.
  ///      Either all of the balance or all of the available liquidity.
  function _redeemMaximumWithLoan() internal override updateSupplyInTheEnd {
    (uint256 supplied, uint256 borrowed) = _getInvestmentData();
    uint256 balance = supplied - borrowed;
    _redeemPartialWithLoan(balance);
    (supplied,) = _getInvestmentData();
    _redeemUnderlying(supplied);
  }

  /////////////////////////////////////////////
  ////////////SPECIFIC INTERNAL FUNCTIONS//////
  /////////////////////////////////////////////


  function rewardPrediction(uint256 _seconds, address token) external view returns (uint256) {
    return _rewardPrediction(_seconds, token);
  }
  /// @notice return reward forecast for token (supply or debt)
  /// @param _seconds time period for the forecast
  /// @param token address (supply or debt)
  /// @return forecasted amount of tokens
  function _rewardPrediction(uint256 _seconds, address token) private view returns (uint256){
    uint dec = IERC20Extended(token).decimals();
    uint rewardPerSecond = chef.rewardsPerSecond();
    uint allocPoint = chef.poolInfo(token).allocPoint;
    uint totalAllocPoint = chef.totalAllocPoint();
    uint totalSupply = chef.poolInfo(token).totalSupply;
    uint rewardPerTotalSupply = rewardPerSecond * allocPoint * _seconds / totalAllocPoint / 2;
    return rewardPerTotalSupply * (10 ** dec) / totalSupply;
  }

  function rewardUnderlyingPrediction(uint256 _seconds, uint256 currentLiquidityRate) external pure returns (uint256){
    return _rewardUnderlyingPrediction(_seconds, currentLiquidityRate);
  }
  /// @notice return underlying reward forecast for aave supply token
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param _seconds time period for the forecast
  /// @param currentLiquidityRate from the AAVE dataProvider
  /// @return forecasted amount of underlying tokens
  function _rewardUnderlyingPrediction(
    uint256 _seconds,
    uint256 currentLiquidityRate
  ) private pure returns (uint256){
    uint256 underlyingPerSecond = currentLiquidityRate / _SECONDS_PER_YEAR;
    uint256 predictedUnderlyingEarned = underlyingPerSecond * _seconds;
    return predictedUnderlyingEarned * _PRECISION / _RAY_PRECISION;
  }

  function debtCostPrediction(
    uint256 _seconds,
    uint256 currentVariableBorrowRate
  ) external pure returns (uint256){
    return _debtCostPrediction(_seconds, currentVariableBorrowRate);
  }
  /// @notice returns forecast of the debt cost in the underlying tokens
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param _seconds time period for the forecast
  /// @return forecasted amount of underlying tokens which needs to be payed as debt interest
  function _debtCostPrediction(
    uint256 _seconds,
    uint256 currentVariableBorrowRate
  ) private pure returns (uint256){
    uint256 debtUnderlyingPerSecond = currentVariableBorrowRate / _SECONDS_PER_YEAR;
    uint256 predictedDebtCost = debtUnderlyingPerSecond * _seconds;
    return predictedDebtCost * _PRECISION / _RAY_PRECISION;
  }

  function totalRewardPrediction(uint256 _seconds) external view returns (
    uint256 supplyRewards,
    uint256 borrowRewards,
    uint256 supplyUnderlyingProfit,
    uint256 debtUnderlyingCost
  ){
    return _totalRewardPrediction(_seconds);
  }

  /// @notice returns forecast of all rewards (WMATIC and underlying) for the given period of time
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param _seconds time period for the forecast
  function _totalRewardPrediction(uint256 _seconds) private view returns (
    uint256 supplyRewards,
    uint256 borrowRewards,
    uint256 supplyUnderlyingProfit,
    uint256 debtUnderlyingCost
  ){
    DataTypes.ReserveData memory rd = lPool.getReserveData(_underlyingToken);
    supplyRewards = _rewardPrediction(_seconds, aToken);
    borrowRewards = _rewardPrediction(_seconds, dToken);
    supplyUnderlyingProfit = _rewardUnderlyingPrediction(_seconds, rd.currentLiquidityRate);
    debtUnderlyingCost = _debtCostPrediction(_seconds, rd.currentVariableBorrowRate);
  }

  function totalRewardPredictionInWeth(uint256 _seconds) external view returns (
    uint256 supplyRewardsInWeth,
    uint256 borrowRewardsInWeth,
    uint256 supplyUnderlyingProfitInWeth,
    uint256 debtUnderlyingCostInWeth
  ){
    return _totalRewardPredictionNormalised(_seconds);
  }

  /// @notice returns forecast of all rewards (WMATIC and underlying)
  ///         for the given period of time in WETH token using AAVE price oracle
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param _seconds time period for the forecast
  function _totalRewardPredictionNormalised(uint256 _seconds) private view returns (
    uint256 supplyRewardsInUsd,
    uint256 borrowRewardsInUsd,
    uint256 supplyUnderlyingProfitInUsd,
    uint256 debtUnderlyingCostInUsd
  ){
    IPriceOracle priceOracle = IPriceOracle(lendingPoolAddressesProvider.getPriceOracle());
    uint256 underlyingPrice = priceOracle.getAssetPrice(_underlyingToken);
    uint256 wftmPrice = priceOracle.getAssetPrice(networkToken);
    uint256 rewardPrice = _getPriceFromLp(lpWithGeist, _rewardTokens[0]) * wftmPrice / _PRECISION;

    (
    uint256 supplyRewards,
    uint256 borrowRewards,
    uint256 supplyUnderlyingProfit,
    uint256 debtUnderlyingCost
    ) = _totalRewardPrediction(_seconds);
    // price denominated in USD and always have 18 decimals
    supplyRewardsInUsd = supplyRewards * rewardPrice / _PRECISION;
    borrowRewardsInUsd = borrowRewards * rewardPrice / _PRECISION;
    supplyUnderlyingProfitInUsd = supplyUnderlyingProfit * underlyingPrice / _PRECISION;
    debtUnderlyingCostInUsd = debtUnderlyingCost * underlyingPrice / _PRECISION;
  }

  /// @notice number of decimals for the supply token
  function supplyTokenDecimals() private view returns (uint8) {
    return IERC20Extended(aToken).decimals();
  }

  /// @notice number of decimals for the debt token
  function debtTokenDecimals() private view returns (uint8) {
    return IERC20Extended(dToken).decimals();
  }

  /// @notice number of decimals for the underlying token
  function underlyingDecimals() private view returns (uint8) {
    return IERC20Extended(_underlyingToken).decimals();
  }

  function _getPriceFromLp(address lpAddress, address token) private view returns (uint256) {
    IUniswapV2Pair pair = IUniswapV2Pair(lpAddress);
    address token0 = pair.token0();
    address token1 = pair.token1();
    (uint256 reserve0, uint256 reserve1,) = pair.getReserves();
    uint256 token0Decimals = IERC20Extended(token0).decimals();
    uint256 token1Decimals = IERC20Extended(token1).decimals();

    // both reserves should have the same decimals
    reserve0 = reserve0 * _PRECISION / (10 ** token0Decimals);
    reserve1 = reserve1 * _PRECISION / (10 ** token1Decimals);

    if (token == token0) {
      return reserve1 * _PRECISION / reserve0;
    } else if (token == token1) {
      return reserve0 * _PRECISION / reserve1;
    } else {
      revert("GFS: token not in lp");
    }
  }


}
