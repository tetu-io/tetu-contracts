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

/// @title Abstract contract for Aave lending strategy implementation with folding functionality
/// @author belbix
/// @author olegn
abstract contract AaveFoldStrategyBase is FoldingBase, IAveFoldStrategy {
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
  string public constant override STRATEGY_NAME = "AaveFoldStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.2.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;
  /// @dev 2 is Variable
  uint256 private constant INTEREST_RATE_MODE = 2;

  ILendingPool private lPool;
  IAaveIncentivesController private aaveController;
  IProtocolDataProvider private dataProvider;
  ILendingPoolAddressesProvider private lendingPoolAddressesProvider;

  address public override aToken;
  address public override dToken;

  struct AaveData {
    address networkToken;
    address pool;
    address controller;
    address dataProvider;
    address addressesProvider;
  }

  /// @notice Contract constructor using on strategy implementation
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator,
    AaveData memory _aaveData
  ) FoldingBase(
    _controller,
    _underlying,
    _vault,
    __rewardTokens,
    _BUY_BACK_RATIO,
    _borrowTargetFactorNumerator,
    _collateralFactorNumerator
  ) {
    lPool = ILendingPool(_aaveData.pool);
    aaveController = IAaveIncentivesController(_aaveData.controller);
    dataProvider = IProtocolDataProvider(_aaveData.dataProvider);
    lendingPoolAddressesProvider = ILendingPoolAddressesProvider(_aaveData.addressesProvider);

    (aToken,,dToken) = dataProvider.getReserveTokensAddresses(_underlying);
    address _lpt = IAToken(aToken).UNDERLYING_ASSET_ADDRESS();
    require(_lpt == _underlyingToken, "AFS: Wrong underlying");
  }

  /////////////////////////////////////////////
  ////////////BASIC STRATEGY FUNCTIONS/////////
  /////////////////////////////////////////////

  /// @notice Return approximately amount of reward tokens ready to claim in AAVE Lending pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    rewards[0] = aaveController.getUserUnclaimedRewards(address(this));
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
    (uint256 supplyRewardsInWethPT,
    uint256 borrowRewardsInWethPT,
    uint256 supplyUnderlyingProfitInWethPT,
    uint256 debtUnderlyingCostInWethPT) = totalRewardPredictionInWeth(_PROFITABILITY_PERIOD);
    uint256 foldingProfitPerToken = supplyRewardsInWethPT + borrowRewardsInWethPT + supplyUnderlyingProfitInWethPT;
    return foldingProfitPerToken > debtUnderlyingCostInWethPT;
  }

  /// @dev Claim distribution rewards
  function _claimReward() internal override {
    address[] memory assets = new address[](2);
    assets[0] = aToken;
    assets[1] = dToken;
    aaveController.claimRewards(assets, type(uint256).max, address(this));
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


  /// @notice return WMATIC reward forecast for aave token (supply or debt)
  /// @param _seconds time period for the forecast
  /// @param token address (supply or debt)
  /// @param aaveIndex see ReserveData for detail (liquidityIndex or variableBorrowIndex)
  /// @return forecasted amount of WMATIC tokens
  function rewardPrediction(uint256 _seconds, address token, uint256 aaveIndex) private view returns (uint256){
    (uint256 emissionPerSecond,,) = aaveController.assets(token);
    uint256 tokenPrecision = 10 ** (IERC20Extended(token)).decimals();
    uint256 totalStakedScaled = IScaledBalanceToken(token).scaledTotalSupply();
    uint256 rewards = emissionPerSecond * _seconds * _RAY_PRECISION * tokenPrecision / aaveIndex / totalStakedScaled;
    return rewards * tokenPrecision / _PRECISION;
  }

  /// @notice return underlying reward forecast for aave supply token
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param _seconds time period for the forecast
  /// @param currentLiquidityRate from the AAVE dataProvider
  /// @return forecasted amount of underlying tokens
  function rewardUnderlyingPrediction(
    uint256 _seconds,
    uint256 currentLiquidityRate
  ) private pure returns (uint256){
    uint256 underlyingPerSecond = currentLiquidityRate / _SECONDS_PER_YEAR;
    uint256 predictedUnderlyingEarned = underlyingPerSecond * _seconds;
    return predictedUnderlyingEarned * _PRECISION / _RAY_PRECISION;
  }

  /// @notice returns forecast of the debt cost in the underlying tokens
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param _seconds time period for the forecast
  /// @return forecasted amount of underlying tokens which needs to be payed as debt interest
  function debtCostPrediction(
    uint256 _seconds,
    uint256 currentVariableBorrowRate
  ) private pure returns (uint256){
    uint256 debtUnderlyingPerSecond = currentVariableBorrowRate / _SECONDS_PER_YEAR;
    uint256 predictedDebtCost = debtUnderlyingPerSecond * _seconds;
    return predictedDebtCost * _PRECISION / _RAY_PRECISION;
  }

  /// @notice returns forecast of all rewards (WMATIC and underlying) for the given period of time
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param _seconds time period for the forecast
  function totalRewardPrediction(uint256 _seconds) private view returns (
    uint256 supplyRewards,
    uint256 borrowRewards,
    uint256 supplyUnderlyingProfit,
    uint256 debtUnderlyingCost
  ){
    (address aTokenAddress,,address variableDebtTokenAddress) = dataProvider.getReserveTokensAddresses(_underlyingToken);
    DataTypes.ReserveData memory rd = lPool.getReserveData(_underlyingToken);
    supplyRewards = rewardPrediction(_seconds, aTokenAddress, rd.liquidityIndex);
    borrowRewards = rewardPrediction(_seconds, variableDebtTokenAddress, rd.variableBorrowIndex);
    supplyUnderlyingProfit = rewardUnderlyingPrediction(_seconds, rd.currentLiquidityRate);
    debtUnderlyingCost = debtCostPrediction(_seconds, rd.currentVariableBorrowRate);

    return (supplyRewards, borrowRewards, supplyUnderlyingProfit, debtUnderlyingCost);
  }
  /// @notice returns forecast of all rewards (WMATIC and underlying)
  ///         for the given period of time in WETH token using AAVE price oracle
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param _seconds time period for the forecast
  function totalRewardPredictionInWeth(uint256 _seconds) private view returns (
    uint256 supplyRewardsInWeth,
    uint256 borrowRewardsInWeth,
    uint256 supplyUnderlyingProfitInWeth,
    uint256 debtUnderlyingCostInWeth
  ){
    IPriceOracle priceOracle = IPriceOracle(lendingPoolAddressesProvider.getPriceOracle());
    uint256 underlyingInWeth = priceOracle.getAssetPrice(_underlyingToken);
    uint256 rewardInWeth = priceOracle.getAssetPrice(_rewardTokens[0]);

    (uint256 supplyRewards, uint256 borrowRewards, uint256 supplyUnderlyingProfit, uint256 debtUnderlyingCost) = totalRewardPrediction(_seconds);
    // oracle price denominated in ETH and always have 18 decimals
    supplyRewardsInWeth = supplyRewards * rewardInWeth / (10 ** underlyingDecimals());
    borrowRewardsInWeth = borrowRewards * rewardInWeth / (10 ** underlyingDecimals());
    supplyUnderlyingProfitInWeth = supplyUnderlyingProfit * underlyingInWeth / _PRECISION;
    debtUnderlyingCostInWeth = debtUnderlyingCost * underlyingInWeth / _PRECISION;
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


}
