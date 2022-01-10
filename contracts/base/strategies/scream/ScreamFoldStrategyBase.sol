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
import "../FoldingBase.sol";
import "../../../third_party/scream/CompleteCToken.sol";
import "../../../third_party/scream/IScreamController.sol";
import "../../../third_party/scream/PriceOracle.sol";
import "../../UniPairLib.sol";

/// @title Abstract contract for Scream lending strategy implementation with folding functionality
/// @author OlegN
abstract contract ScreamFoldStrategyBase is FoldingBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "ScreamFoldStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.2.0";
  /// @dev How much rewards will be used for distribution process
  uint256 private constant _BUY_BACK_RATIO = _BUY_BACK_DENOMINATOR / 10;
  /// @dev precision for the folding profitability calculation
  uint256 private constant _PRECISION = 10 ** 18;
  /// @dev SCREAM token address for reward price determination
  address public constant SCREAM_R_TOKEN = 0xe0654C8e6fd4D733349ac7E09f6f23DA256bF475;

  /// @notice scToken address
  address public scToken;
  /// @notice Scream Controller address
  address public screamController;
  /// @dev lp with Scream tokens used for price calculation
  address private lpWithScream;
  /// @dev WFTM token address
  address private scNetworkToken;
  /// @dev Scream price oracle
  PriceOracle priceOracle;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _scToken,
    address _screamController,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator,
    address _lpWithScream,
    address _scNetworkToken
  ) FoldingBase(
    _controller,
    _underlying,
    _vault,
    __rewardTokens,
    _BUY_BACK_RATIO,
    _borrowTargetFactorNumerator,
    _collateralFactorNumerator
  ) {
    require(_scToken != address(0), "SFS: Zero address rToken");
    require(_screamController != address(0), "SFS: Zero address screamController");
    scToken = _scToken;
    screamController = _screamController;
    lpWithScream = _lpWithScream;
    scNetworkToken = _scNetworkToken;
    priceOracle = PriceOracle(IScreamController(screamController).oracle());
    address _lpt = CompleteCToken(scToken).underlying();
    require(_lpt == _underlyingToken, "SFS: Wrong underlying");
  }

  /////////////////////////////////////////////
  ////////////BASIC STRATEGY FUNCTIONS/////////
  /////////////////////////////////////////////

  /// @notice Return approximately amount of reward tokens ready to claim in Scream Controller contract
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    rewards[0] = IScreamController(screamController).compAccrued(address(this));
    return rewards;
  }

  /// @notice TVL of the underlying in the rToken contract
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return CompleteCToken(scToken).getCash()
    .add(CompleteCToken(scToken).totalBorrows())
    .sub(CompleteCToken(scToken).totalReserves());
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  ///////////////////////////////////////////////////////////////////////////////////////
  ///////////// internal functions require specific implementation for each platforms ///
  ///////////////////////////////////////////////////////////////////////////////////////

  function _getInvestmentData() internal override returns (uint256 supplied, uint256 borrowed){
    supplied = CompleteCToken(scToken).balanceOfUnderlying(address(this));
    borrowed = CompleteCToken(scToken).borrowBalanceCurrent(address(this));
  }

  /// @dev Return true if we can gain profit with folding
  function _isFoldingProfitable() internal view override returns (bool) {
    (uint256 supplyRewardsInUSDC,
    uint256 borrowRewardsInUSDC,
    uint256 supplyUnderlyingProfitInUSDC,
    uint256 debtUnderlyingCostInUSDC) = totalRewardPredictionInUSDC();

    uint256 claimableRewards = supplyRewardsInUSDC + borrowRewardsInUSDC;
    if (_isAutocompound()) {
      claimableRewards = claimableRewards * (_BUY_BACK_DENOMINATOR - _buyBackRatio) / _BUY_BACK_DENOMINATOR;
    }
    // reduce claimable rewards estimation for keep a gap
    // this gap will be a minimum generated profit otherwise we will do folding for nothing
    claimableRewards = claimableRewards * 95 / 100;
    uint256 foldingProfitPerToken = claimableRewards + supplyUnderlyingProfitInUSDC;
    return foldingProfitPerToken > debtUnderlyingCostInUSDC;
  }

  /// @dev Claim distribution rewards
  function _claimReward() internal override {
    address[] memory markets = new address[](1);
    markets[0] = scToken;
    IScreamController(screamController).claimComp(address(this), markets);
  }

  function _supply(uint256 amount) internal override updateSupplyInTheEnd {
    amount = Math.min(IERC20(_underlyingToken).balanceOf(address(this)), amount);
    IERC20(_underlyingToken).safeApprove(scToken, 0);
    IERC20(_underlyingToken).safeApprove(scToken, amount);
    require(CompleteCToken(scToken).mint(amount) == 0, "SFS: Supplying failed");
  }

  function _borrow(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    // Borrow, check the balance for this contract's address
    require(CompleteCToken(scToken).borrow(amountUnderlying) == 0, "SFS: Borrow failed");
  }

  function _redeemUnderlying(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    amountUnderlying = Math.min(amountUnderlying, _maxRedeem());
    if (amountUnderlying > 0) {
      uint256 redeemCode = 999;
      try CompleteCToken(scToken).redeemUnderlying(amountUnderlying) returns (uint256 code) {
        redeemCode = code;
      } catch{}
      if (redeemCode != 0) {
        // Scream has verification function that can ruin tx with underlying, in this case redeem scToken will work
        (,,, uint256 exchangeRate) = CompleteCToken(scToken).getAccountSnapshot(address(this));
        uint256 scTokenRedeem = amountUnderlying * 1e18 / exchangeRate / 100;
        if (scTokenRedeem > 0) {
          _redeemLoanToken(scTokenRedeem);
        }
      }
    }
  }

  function _redeemLoanToken(uint256 amount) internal updateSupplyInTheEnd {
    if (amount > 0) {
      uint256 res = CompleteCToken(scToken).redeem(amount);
      require(res == 0, "SFS: Redeem failed");
    }
  }

  function _repay(uint256 amountUnderlying) internal override updateSupplyInTheEnd {
    if (amountUnderlying != 0) {
      IERC20(_underlyingToken).safeApprove(scToken, 0);
      IERC20(_underlyingToken).safeApprove(scToken, amountUnderlying);
      require(CompleteCToken(scToken).repayBorrow(amountUnderlying) == 0, "SFS: Repay failed");
    }
  }

  /// @dev Redeems the maximum amount of underlying. Either all of the balance or all of the available liquidity.
  function _redeemMaximumWithLoan() internal override updateSupplyInTheEnd {
    uint256 supplied = CompleteCToken(scToken).balanceOfUnderlying(address(this));
    uint256 borrowed = CompleteCToken(scToken).borrowBalanceCurrent(address(this));
    uint256 balance = supplied.sub(borrowed);
    _redeemPartialWithLoan(balance);

    // we have a little amount of supply after full exit
    // better to redeem rToken amount for avoid rounding issues
    (,uint256 scTokenBalance,,) = CompleteCToken(scToken).getAccountSnapshot(address(this));
    if (scTokenBalance > 0) {
      _redeemLoanToken(scTokenBalance);
    }
  }

  /////////////////////////////////////////////
  ////////////SPECIFIC INTERNAL FUNCTIONS//////
  /////////////////////////////////////////////

  function decimals() private view returns (uint8) {
    return CompleteCToken(scToken).decimals();
  }

  function underlyingDecimals() private view returns (uint8) {
    return IERC20Extended(_underlyingToken).decimals();
  }

  /// @notice returns forecast of all rewards (SCREAM and underlying) for the given period of time
  function totalRewardPrediction() private view returns (
    uint256 supplyRewards,
    uint256 borrowRewards,
    uint256 supplyUnderlyingProfit,
    uint256 debtUnderlyingCost
  ){
    CompleteCToken rt = CompleteCToken(scToken);
    // get reward per token for both - suppliers and borrowers
    uint256 rewardSpeed = IScreamController(screamController).compSpeeds(scToken);
    // get total supply, cash and borrows, and normalize them to 18 decimals
    uint256 totalSupply = rt.totalSupply() * 1e18 / (10 ** decimals());
    uint256 totalBorrows = rt.totalBorrows() * 1e18 / (10 ** underlyingDecimals());

    // exchange rate between scToken and underlyingToken
    uint256 scTokenExchangeRate = rt.exchangeRateStored() * (10 ** decimals()) / (10 ** underlyingDecimals());

    // amount of reward tokens per block for 1 supplied underlyingToken
    supplyRewards = rewardSpeed * 1e18 / scTokenExchangeRate * 1e18 / totalSupply;

    // amount of reward tokens per block for 1 borrowed underlyingToken
    borrowRewards = rewardSpeed * 1e18 / totalBorrows;

    supplyUnderlyingProfit = rt.supplyRatePerBlock();
    debtUnderlyingCost = rt.borrowRatePerBlock();
    return (supplyRewards, borrowRewards, supplyUnderlyingProfit, debtUnderlyingCost);
  }

  /// @notice returns forecast of all rewards (SCREAM and underlying)
  ///         for the given period of time in USDC token using SCREAM price oracle
  function totalRewardPredictionInUSDC() private view returns (
    uint256 supplyRewardsInUSDC,
    uint256 borrowRewardsInUSDC,
    uint256 supplyUnderlyingProfitInUSDC,
    uint256 debtUnderlyingCostInUSDC
  ){
    uint256 rewardTokenUSDC = getRewardTokenPrice();
    uint256 scTokenUSDC = scTokenUnderlyingPrice(scToken);

    (uint256 supplyRewards, uint256 borrowRewards, uint256 supplyUnderlyingProfit, uint256 debtUnderlyingCost) = totalRewardPrediction();

    supplyRewardsInUSDC = supplyRewards * rewardTokenUSDC / _PRECISION;
    borrowRewardsInUSDC = borrowRewards * rewardTokenUSDC / _PRECISION;
    supplyUnderlyingProfitInUSDC = supplyUnderlyingProfit * scTokenUSDC / _PRECISION;
    debtUnderlyingCostInUSDC = debtUnderlyingCost * scTokenUSDC / _PRECISION;
  }

  /// @dev Return scToken price from Scream Oracle solution. Can be used on-chain safely
  function scTokenUnderlyingPrice(address _scToken) public view returns (uint256){
    uint256 _scTokenPrice = priceOracle.getUnderlyingPrice(_scToken);

    // normalize token price to 1e18
    if (underlyingDecimals() < 18) {
      _scTokenPrice = _scTokenPrice / (10 ** (18 - underlyingDecimals()));
    }
    return _scTokenPrice;
  }

  function getRewardTokenPrice() private view returns (uint256){
    uint256 scWftmPrice = priceOracle.getUnderlyingPrice(scNetworkToken);
    uint256 rewardPrice = UniPairLib.getPrice(lpWithScream, SCREAM_R_TOKEN) * scWftmPrice / _PRECISION;
    return rewardPrice;
  }

}
