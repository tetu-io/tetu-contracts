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
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../StrategyBase.sol";

import "../../interface/ISmartVault.sol";
import "../../../third_party/IWmatic.sol";
import "../../../third_party/aave/IAToken.sol";
import "../../interface/IAveFoldStrategy.sol";
import "../../../third_party/aave/ILendingPool.sol";

import "../../../third_party/aave/IAaveIncentivesController.sol";
import "../../../third_party/aave/IProtocolDataProvider.sol";
import "../../../third_party/aave/DataTypes.sol";
import "../../../third_party/aave/IPriceOracle.sol";


/// @title Abstract contract for Aave lending strategy implementation with folding functionality
/// @author JasperS13
/// @author belbix
/// @author olegn
abstract contract AaveFoldStrategyBase is StrategyBase, IAveFoldStrategy {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @dev precision for the folding profitability calculation
  uint8 private constant _PRECISION = 18;
  /// @dev precision for the RAY values e.g currentLiquidityRate value
  uint8 private constant _RAY_PRECISION = 27;
  /// @dev approximate number of seconds per year
  uint256 private constant _SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
  /// @dev approximate 1 month - default time period for profitability forecast
  uint256 private constant _PROFITABILITY_PERIOD = 30 days;
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "AaveFoldStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;
  /// @dev Maximum folding loops
  uint256 public constant MAX_DEPTH = 20;

  address public constant WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
  address public constant W_MATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
  address public constant AMWMATIC = 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4;

  address public constant AAVE_LENDING_POOL = 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf;
  address public constant AAVE_CONTROLLER = 0x357D51124f59836DeD84c8a1730D72B749d8BC23;
  address public constant AAVE_DATA_PROVIDER = 0x7551b5D2763519d4e37e8B81929D336De671d46d;
  address public constant AAVE_LENDING_POOL_ADDRESSES_PROVIDER = 0xd05e3E715d945B59290df0ae8eF85c1BdB684744;

  ILendingPool lPool = ILendingPool(AAVE_LENDING_POOL);
  IAaveIncentivesController aaveController = IAaveIncentivesController(AAVE_CONTROLLER);
  IProtocolDataProvider dataProvider = IProtocolDataProvider(AAVE_DATA_PROVIDER);
  ILendingPoolAddressesProvider lendingPoolAddressesProvider = ILendingPoolAddressesProvider(AAVE_LENDING_POOL_ADDRESSES_PROVIDER);

  address public override aToken;
  address public override dToken;

  /// @notice Numerator value for the targeted borrow rate
  uint256 public borrowTargetFactorNumeratorStored;
  uint256 public borrowTargetFactorNumerator;
  /// @notice Numerator value for the asset market collateral value
  uint256 public collateralFactorNumerator;
  /// @notice Denominator value for the both above mentioned ratios
  uint256 public factorDenominator;
  /// @notice Use folding
  bool public fold = true;

  /// @notice Strategy balance parameters to be tracked
  uint256 public suppliedInUnderlying;
  uint256 public borrowedInUnderlying;

  event FoldChanged(bool value);
  event FoldStopped();
  event FoldStarted(uint256 borrowTargetFactorNumerator);
  event MaxDepthReached();
  event NoMoneyForLiquidateUnderlying();
  event UnderlyingLiquidationFailed();
  event Rebalanced(uint256 supplied, uint256 borrowed, uint256 borrowTarget);
  event BorrowTargetFactorNumeratorChanged(uint256 value);
  event CollateralFactorNumeratorChanged(uint256 value);

  modifier updateSupplyInTheEnd() {
    _;
    (suppliedInUnderlying, borrowedInUnderlying) = _getInvestmentData();
  }

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator,
    uint256 _factorDenominator
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    (aToken,,dToken) = dataProvider.getReserveTokensAddresses(_underlying);
    address _lpt = IAToken(aToken).UNDERLYING_ASSET_ADDRESS();
    require(_lpt == _underlyingToken, "AFS: Wrong underlying");

    factorDenominator = _factorDenominator;

    require(_collateralFactorNumerator < factorDenominator, "AFS: Collateral factor cannot be this high");
    collateralFactorNumerator = _collateralFactorNumerator;

    require(_borrowTargetFactorNumerator < collateralFactorNumerator, "AFS: Target should be lower than collateral limit");
    borrowTargetFactorNumeratorStored = _borrowTargetFactorNumerator;
    borrowTargetFactorNumerator = _borrowTargetFactorNumerator;
  }

  // ************* VIEWS *******************

  /// @notice return WMATIC reward forecast for aave token (supply or debt)
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param numberOfBlocks time period for the forecast
  /// @param token address (supply or debt)
  /// @return forecasted amount of WMATIC tokens
  function rewardPrediction(uint256 numberOfBlocks, address token) public view returns (uint256){
    (uint256 emissionPerSecond,,) = aaveController.assets(token);
    (uint256 stakedByUserScaled, uint256 totalStakedScaled) = IScaledBalanceToken(token).getScaledUserBalanceAndSupply(address(this));
    uint256 rewards = emissionPerSecond.mul(numberOfBlocks).mul(10 ** uint256(_PRECISION)).div(totalStakedScaled).mul(stakedByUserScaled).div(10 ** uint256(_PRECISION));
    return rewards;
  }

  /// @notice return underlying reward forecast for aave supply token
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param numberOfBlocks time period for the forecast
  /// @param token address (supply)
  /// @param currentLiquidityRate from the AAVE dataProvider
  /// @return forecasted amount of underlying tokens
  function rewardUnderlyingPrediction(
    uint256 numberOfBlocks,
    address token,
    uint256 currentLiquidityRate
  ) public view returns (uint256){
    uint256 underlyingPerSecond = currentLiquidityRate.div(_SECONDS_PER_YEAR);
    uint256 underlyingBalance = IERC20(token).balanceOf(address(this));
    uint256 predictedUnderlyingEarned = underlyingPerSecond.mul(numberOfBlocks);
    return predictedUnderlyingEarned.mul(underlyingBalance).div(10 ** uint256(_RAY_PRECISION));
  }

  /// @notice returns forecast of the debt cost in the underlying tokens
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param numberOfBlocks time period for the forecast
  /// @param token address (debt)
  /// @return forecasted amount of underlying tokens which needs to be payed as debt interest
  function debtCostPrediction(
    uint256 numberOfBlocks,
    address token,
    uint256 currentVariableBorrowRate
  ) public view returns (uint256){
    uint256 debtUnderlyingPerSecond = currentVariableBorrowRate.div(_SECONDS_PER_YEAR);
    uint256 debtBalance = IERC20(token).balanceOf(address(this));
    uint256 predictedDebtCost = debtUnderlyingPerSecond.mul(numberOfBlocks);
    return predictedDebtCost.mul(debtBalance).div(10 ** uint256(_RAY_PRECISION));
  }

  /// @notice returns forecast of all rewards (WMATIC and underlying) for the given period of time
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param numberOfBlocks time period for the forecast
  function totalRewardPrediction(uint256 numberOfBlocks) public view returns (
    uint256 supplyRewards,
    uint256 borrowRewards,
    uint256 supplyUnderlyingProfit,
    uint256 debtUnderlyingCost
  ){
    (address aTokenAddress,,address variableDebtTokenAddress) = dataProvider.getReserveTokensAddresses(_underlyingToken);

    supplyRewards = rewardPrediction(numberOfBlocks, aTokenAddress);
    borrowRewards = rewardPrediction(numberOfBlocks, variableDebtTokenAddress);

    DataTypes.ReserveData memory rd = lPool.getReserveData(_underlyingToken);
    supplyUnderlyingProfit = rewardUnderlyingPrediction(numberOfBlocks, aTokenAddress, rd.currentLiquidityRate);
    debtUnderlyingCost = debtCostPrediction(numberOfBlocks, variableDebtTokenAddress, rd.currentVariableBorrowRate);

    return (supplyRewards, borrowRewards, supplyUnderlyingProfit, debtUnderlyingCost);
  }
  /// @notice returns forecast of all rewards (WMATIC and underlying)
  ///         for the given period of time in WETH token using AAVE price oracle
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param numberOfBlocks time period for the forecast
  function totalRewardPredictionInWeth(uint256 numberOfBlocks) public view returns (
    uint256 supplyRewardsInWeth,
    uint256 borrowRewardsInWeth,
    uint256 supplyUnderlyingProfitInWeth,
    uint256 debtUnderlyingCostInWeth
  ){
    IPriceOracle priceOracle = IPriceOracle(lendingPoolAddressesProvider.getPriceOracle());
    uint256 underlyingInWeth = priceOracle.getAssetPrice(_underlyingToken);
    uint256 rewardInWeth = priceOracle.getAssetPrice(_rewardTokens[0]);
    uint256 wethDecimals = (ERC20(WETH)).decimals();

    (uint256 supplyRewards, uint256 borrowRewards, uint256 supplyUnderlyingProfit, uint256 debtUnderlyingCost) = totalRewardPrediction(numberOfBlocks);

    supplyRewardsInWeth = supplyRewards.mul(rewardInWeth).div(10 ** wethDecimals);
    borrowRewardsInWeth = borrowRewards.mul(rewardInWeth).div(10 ** wethDecimals);

    supplyUnderlyingProfitInWeth = supplyUnderlyingProfit.mul(underlyingInWeth).div(10 ** wethDecimals);
    debtUnderlyingCostInWeth = debtUnderlyingCost.mul(underlyingInWeth).div(10 ** wethDecimals);
  }
  /// @notice returns normalized (per invested underlying token) forecast of all rewards (WMATIC and underlying)
  ///         for the given period of time in WETH token using AAVE price oracle .
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @param numberOfBlocks time period for the forecast
  function normTotalRewardPredictionInWeth(uint256 numberOfBlocks) public view returns (
    uint256 supplyRewardsInWethPT,
    uint256 borrowRewardsInWethPT,
    uint256 supplyUnderlyingProfitInWethPT,
    uint256 debtUnderlyingCostInWethPT
  ){
    uint256 supplyBalance = IERC20(aToken).balanceOf(address(this));
    uint256 debtBalance = IERC20(dToken).balanceOf(address(this));

    (uint256 supplyRewardsInWeth,
    uint256 borrowRewardsInWeth,
    uint256 supplyUnderlyingProfitInWeth,
    uint256 debtUnderlyingCostInWeth) = totalRewardPredictionInWeth(numberOfBlocks);

    supplyRewardsInWethPT = supplyRewardsInWeth.mul(10 ** uint256(_PRECISION)).div(supplyBalance);
    supplyUnderlyingProfitInWethPT = supplyUnderlyingProfitInWeth.mul(10 ** uint256(_PRECISION)).div(supplyBalance);

    borrowRewardsInWethPT = 0;
    debtUnderlyingCostInWethPT = 0;
    if (debtBalance > 0) {
      borrowRewardsInWethPT = borrowRewardsInWeth.mul(10 ** uint256(_PRECISION)).div(debtBalance);
      debtUnderlyingCostInWethPT = debtUnderlyingCostInWeth.mul(10 ** uint256(_PRECISION)).div(debtBalance);
    }
  }

  /// @notice number of decimals for the supply token
  function supplyTokenDecimals() private view returns (uint8) {
    return ERC20(aToken).decimals();
  }

  /// @notice number of decimals for the debt token
  function debtTokenDecimals() private view returns (uint8) {
    return ERC20(dToken).decimals();
  }

  /// @notice number of decimals for the underlying token
  function underlyingDecimals() private view returns (uint8) {
    return ERC20(_underlyingToken).decimals();
  }

  /// @notice Strategy balance supplied minus borrowed
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256) {
    return suppliedInUnderlying.sub(borrowedInUnderlying);
  }

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

  /// @dev Return true if we can gain profit with folding
  function isFoldingProfitable() public view returns (bool) {
    (uint256 supplyRewardsInWethPT,
    uint256 borrowRewardsInWethPT,
    uint256 supplyUnderlyingProfitInWethPT,
    uint256 debtUnderlyingCostInWethPT) = normTotalRewardPredictionInWeth(_PROFITABILITY_PERIOD);

    uint256 foldingProfitPerToken = supplyRewardsInWethPT + borrowRewardsInWethPT + supplyUnderlyingProfitInWethPT;
    return foldingProfitPerToken > debtUnderlyingCostInWethPT;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override restricted {
    investAllUnderlying();
    claimReward();
    compound();
    liquidateReward();
    if (!isFoldingProfitable() && fold) {
      stopFolding();
    } else if (isFoldingProfitable() && !fold) {
      startFolding();
    } else {
      rebalance();
    }
  }

  /// @dev Rebalances the borrow ratio
  function rebalance() public restricted updateSupplyInTheEnd {
    (uint256 supplied, uint256 borrowed) = _getInvestmentData();
    uint256 balance = supplied.sub(borrowed);

    uint256 borrowTarget = balance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
    if (borrowed > borrowTarget) {
      _redeemPartialWithLoan(0);
    } else if (borrowed < borrowTarget) {
      depositToPool(0);
    }
    emit Rebalanced(supplied, borrowed, borrowTarget);
  }

  /// @dev Set use folding
  function setFold(bool _fold) public restricted {
    fold = _fold;
    emit FoldChanged(_fold);
  }

  /// @dev Set borrow rate target
  function setBorrowTargetFactorNumeratorStored(uint256 _target) public restricted {
    require(_target < collateralFactorNumerator, "Target should be lower than collateral limit");
    borrowTargetFactorNumeratorStored = _target;
    if (fold) {
      borrowTargetFactorNumerator = _target;
    }
    emit BorrowTargetFactorNumeratorChanged(_target);
  }

  function stopFolding() public restricted {
    borrowTargetFactorNumerator = 0;
    setFold(false);
    rebalance();
    emit FoldStopped();
  }

  function startFolding() public restricted {
    borrowTargetFactorNumerator = borrowTargetFactorNumeratorStored;
    setFold(true);
    rebalance();
    emit FoldStarted(borrowTargetFactorNumeratorStored);
  }

  /// @dev Set collateral rate for asset market
  function setCollateralFactorNumerator(uint256 _target) external restricted {
    require(_target < factorDenominator, "Collateral factor cannot be this high");
    collateralFactorNumerator = _target;
    emit CollateralFactorNumeratorChanged(_target);
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to aToken contract
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override updateSupplyInTheEnd {
    if (amount > 0) {
      // we need to sell excess in non hardWork function for keeping ppfs ~1
      liquidateExcessUnderlying();
      _supply(amount);
    }
    if (!fold || !isFoldingProfitable()) {
      return;
    }
    (uint256 supplied,uint256 borrowed) = _getInvestmentData();
    uint256 balance = supplied.sub(borrowed);
    uint256 borrowTarget = balance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
    uint256 i = 0;
    while (borrowed < borrowTarget) {
      uint256 wantBorrow = borrowTarget.sub(borrowed);
      uint256 maxBorrow = supplied.mul(collateralFactorNumerator).div(factorDenominator).sub(borrowed);

      _borrow(Math.min(wantBorrow, maxBorrow));
      uint256 underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
      if (underlyingBalance > 0) {
        _supply(underlyingBalance);
      }
      //update parameters
      (supplied, borrowed) = _getInvestmentData();
      i++;
      if (i == MAX_DEPTH) {
        emit MaxDepthReached();
        break;
      }
    }
  }

  /// @dev Withdraw underlying
  /// @param amount Withdraw amount
  function withdrawAndClaimFromPool(uint256 amount) internal override updateSupplyInTheEnd {
    claimReward();
    _redeemPartialWithLoan(amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override updateSupplyInTheEnd {
    _redeemMaximumWithLoan();
  }

  function exitRewardPool() internal override updateSupplyInTheEnd {
    uint256 bal = rewardPoolBalance();
    if (bal != 0) {
      claimReward();
      _redeemMaximumWithLoan();
      // reward liquidation can ruin transaction, do it in hard work process
    }
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  /// @dev Claim distribution rewards
  function claimReward() internal {
    address[] memory assets = new address[](2);
    assets[0] = aToken;
    assets[1] = dToken;
    aaveController.claimRewards(assets, type(uint256).max, address(this));
  }

  function compound() internal {
    (suppliedInUnderlying, borrowedInUnderlying) = _getInvestmentData();
    uint256 ppfs = ISmartVault(_smartVault).getPricePerFullShare();
    uint256 ppfsPeg = ISmartVault(_smartVault).underlyingUnit();
    // in case of negative ppfs compound all profit to underlying
    if (ppfs < ppfsPeg) {
      for (uint256 i = 0; i < _rewardTokens.length; i++) {
        uint256 amount = rewardBalance(i);
        address rt = _rewardTokens[i];
        // it will sell reward token to Target Token and send back
        if (amount != 0) {
          address forwarder = IController(controller()).feeRewardForwarder();
          // keep a bit for for distributing for catch all necessary events
          amount = amount * 90 / 100;
          IERC20(rt).safeApprove(forwarder, 0);
          IERC20(rt).safeApprove(forwarder, amount);
          uint256 underlyingProfit = IFeeRewardForwarder(forwarder).liquidate(rt, _underlyingToken, amount);
          // supply profit for correct ppfs calculation
          if (underlyingProfit != 0) {
            _supply(underlyingProfit);
          }
        }
      }
      // safe way to keep ppfs peg is sell excess after reward liquidation
      // it should not decrease old ppfs
      liquidateExcessUnderlying();
      // in case of ppfs decreasing we will get revert in vault anyway
      require(ppfs <= ISmartVault(_smartVault).getPricePerFullShare(), "AFS: Ppfs decreased after compound");
    }
  }

  /// @dev We should keep PPFS ~1
  ///      This function must not ruin transaction
  function liquidateExcessUnderlying() internal updateSupplyInTheEnd {
    // update balances for accurate ppfs calculation
    (suppliedInUnderlying, borrowedInUnderlying) = _getInvestmentData();
    address forwarder = IController(controller()).feeRewardForwarder();
    uint256 ppfs = ISmartVault(_smartVault).getPricePerFullShare();
    uint256 ppfsPeg = ISmartVault(_smartVault).underlyingUnit();

    if (ppfs > ppfsPeg) {

      uint256 undBal = ISmartVault(_smartVault).underlyingBalanceWithInvestment();
      if (undBal == 0
      || ERC20(_smartVault).totalSupply() == 0
      || undBal < ERC20(_smartVault).totalSupply()
        || undBal - ERC20(_smartVault).totalSupply() < 2) {
        // no actions in case of no money
        emit NoMoneyForLiquidateUnderlying();
        return;
      }
      // ppfs = 1 if underlying balance = total supply
      // -1 for avoiding problem with rounding
      uint256 toLiquidate = (undBal - ERC20(_smartVault).totalSupply()) - 1;
      if (underlyingBalance() < toLiquidate) {
        _redeemPartialWithLoan(toLiquidate - underlyingBalance());
      }
      toLiquidate = Math.min(underlyingBalance(), toLiquidate);
      if (toLiquidate != 0) {
        IERC20(_underlyingToken).safeApprove(forwarder, 0);
        IERC20(_underlyingToken).safeApprove(forwarder, toLiquidate);

        // it will sell reward token to Target Token and distribute it to SmartVault and PS
        // we must not ruin transaction in any case
        //slither-disable-next-line unused-return,variable-scope,uninitialized-local
        try IFeeRewardForwarder(forwarder).distribute(toLiquidate, _underlyingToken, _smartVault)
        returns (uint256 targetTokenEarned) {
          if (targetTokenEarned > 0) {
            IBookkeeper(IController(controller()).bookkeeper()).registerStrategyEarned(targetTokenEarned);
          }
        } catch {
          emit UnderlyingLiquidationFailed();
        }
      }
    }
  }

  /// @dev Supplies to Aave
  function _supply(uint256 amount) internal updateSupplyInTheEnd {
    amount = Math.min(IERC20(_underlyingToken).balanceOf(address(this)), amount);
    IERC20(_underlyingToken).safeApprove(AAVE_LENDING_POOL, 0);
    IERC20(_underlyingToken).safeApprove(AAVE_LENDING_POOL, amount);
    lPool.deposit(_underlyingToken, amount, address(this), 0);
  }

  /// @dev Borrows against the collateral
  function _borrow(uint256 amountUnderlying) internal updateSupplyInTheEnd {
    // Borrow, check the balance for this contract's address
    lPool.borrow(_underlyingToken, amountUnderlying, 2, 0, address(this));
  }

  /// @dev Redeem liquidity in underlying
  function _redeemUnderlying(uint256 amountUnderlying) internal updateSupplyInTheEnd {
    // we can have a very little gap, it will slightly decrease ppfs and should be covered with reward liquidation process
    (uint256 suppliedUnderlying,) = _getInvestmentData();
    amountUnderlying = Math.min(amountUnderlying, suppliedUnderlying);
    if (amountUnderlying > 0) {
      lPool.withdraw(_underlyingToken, amountUnderlying, address(this));
    }
  }

  /// @dev Redeem liquidity in rToken
  function _redeemAToken(uint256 amountAToken) internal updateSupplyInTheEnd {
    if (amountAToken > 0) {
      lPool.withdraw(_underlyingToken, amountAToken, address(this));
      uint256 aTokenBalance = IERC20(aToken).balanceOf(address(this));
      require(aTokenBalance == 0, "AFS: Redeem failed");
    }
  }

  /// @dev Repay a loan
  function _repay(uint256 amountUnderlying) internal updateSupplyInTheEnd {
    if (amountUnderlying != 0) {
      IERC20(_underlyingToken).safeApprove(AAVE_LENDING_POOL, 0);
      IERC20(_underlyingToken).safeApprove(AAVE_LENDING_POOL, amountUnderlying);
      lPool.repay(_underlyingToken, amountUnderlying, 2, address(this));
    }
  }

  /// @dev Redeems the maximum amount of underlying. Either all of the balance or all of the available liquidity.
  function _redeemMaximumWithLoan() internal updateSupplyInTheEnd {
    // amount of liquidity
    (uint256 availableLiquidity,,,,,,,,,) = dataProvider.getReserveData(_underlyingToken);
    (uint256 supplied, uint256 borrowed) = _getInvestmentData();
    uint256 balance = supplied.sub(borrowed);
    _redeemPartialWithLoan(Math.min(availableLiquidity, balance));

    // we have a little amount of supply after full exit
    // better to redeem rToken amount for avoid rounding issues
    (supplied, borrowed) = _getInvestmentData();
    uint256 aTokenBalance = IERC20(aToken).balanceOf(address(this));

    if (aTokenBalance > 0) {
      _redeemAToken(aTokenBalance);
    }
  }

  /// @dev Helper function to get suppliedUnderlying and borrowedUnderlying
  function _getInvestmentData() internal view returns (uint256, uint256){
    (uint256 suppliedUnderlying,,uint256 borrowedUnderlying,,,,,,) = dataProvider.getUserReserveData(_underlyingToken, address(this));
    return (suppliedUnderlying, borrowedUnderlying);
  }


  /// @dev Redeems a set amount of underlying tokens while keeping the borrow ratio healthy.
  ///      This function must nor revert transaction
  function _redeemPartialWithLoan(uint256 amount) internal updateSupplyInTheEnd {
    (uint256 supplied, uint256 borrowed) = _getInvestmentData();
    uint256 oldBalance = supplied.sub(borrowed);

    uint256 newBalance = 0;
    if (amount < oldBalance) {
      newBalance = oldBalance.sub(amount);
    }
    uint256 newBorrowTarget = newBalance.mul(borrowTargetFactorNumerator).div(factorDenominator.sub(borrowTargetFactorNumerator));
    uint256 underlyingBalance = 0;
    uint256 i = 0;
    while (borrowed > newBorrowTarget) {
      uint256 requiredCollateral = borrowed.mul(factorDenominator).div(collateralFactorNumerator);
      uint256 toRepay = borrowed.sub(newBorrowTarget);
      if (supplied < requiredCollateral) {
        break;
      }
      // redeem just as much as needed to repay the loan
      // supplied - requiredCollateral = max redeemable, amount + repay = needed
      uint256 toRedeem = Math.min(supplied.sub(requiredCollateral), amount.add(toRepay));
      _redeemUnderlying(toRedeem);
      // now we can repay our borrowed amount
      underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
      toRepay = Math.min(toRepay, underlyingBalance);
      if (toRepay == 0) {
        // in case of we don't have money for repaying we can't do anything
        break;
      }
      _repay(toRepay);
      // update the parameters
      (supplied, borrowed) = _getInvestmentData();
      i++;
      if (i == MAX_DEPTH) {
        emit MaxDepthReached();
        break;
      }
    }
    underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
    if (underlyingBalance < amount) {
      uint256 toRedeem = amount.sub(underlyingBalance);
      // redeem the most we can redeem
      _redeemUnderlying(toRedeem);
    }
  }
}
