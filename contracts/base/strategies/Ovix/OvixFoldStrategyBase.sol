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

import "../FoldingBase.sol";
import "./interfaces/ICompleteOToken.sol";
import "./interfaces/IOMatic.sol";
import "./interfaces/IPriceOracle.sol";
import "../../../third_party/IWmatic.sol";
import "../../interface/strategies/IOvixFoldStrategy.sol";

/// @title Abstract contract for Ovix lending strategy implementation with folding functionality
/// @author JasperS13
/// @author belbix
/// @author C-note
abstract contract OvixFoldStrategyBase is FoldingBase {
    using SafeERC20 for IERC20;

    // ************ VARIABLES **********************
    /// @notice Strategy type for statistical purposes
    string public constant override STRATEGY_NAME = "OvixFoldStrategyBase";
    /// @notice Version of the contract
    /// @dev Should be incremented when contract changed
    string public constant VERSION = "1.0.0";
    /// @dev Placeholder, for non full buyback need to implement liquidation
    uint256 private constant _BUY_BACK_RATIO = 10000;
    /// @dev precision for the folding profitability calculation
    uint256 private constant _PRECISION = 10**18;

    /// @notice oToken address
    address public oToken;
    /// @notice Ovix Controller address
    address public ovixController;
    /// @notice ovix fold strategy address
    IOvixFoldStrategy public ovixFoldStrategyAddress;

    /// @notice Contract constructor using on strategy implementation
    /// @dev The implementation should check each parameter
    constructor(
        address _controller,
        address _underlying,
        address _vault,
        address[] memory __rewardTokens,
        address _oToken,
        address _ovixController,
        uint256 _borrowTargetFactorNumerator,
        uint256 _collateralFactorNumerator
    )
        FoldingBase(
            _controller,
            _underlying,
            _vault,
            __rewardTokens,
            _BUY_BACK_RATIO,
            _borrowTargetFactorNumerator,
            _collateralFactorNumerator
        )
    {
        require(_oToken != address(0), "OFS: Zero address oToken");
        require(_ovixController != address(0), "OFS: Zero address ovixController");
        oToken = _oToken;
        ovixController = _ovixController;

        if (_isMatic()) {
            require(_underlyingToken == ovixFoldStrategyAddress.W_MATIC(), "OFS: Only wmatic allowed");
        } else {
            address _lpt = ICompleteOToken(oToken).underlying();
            require(_lpt == _underlyingToken, "OFS: Wrong underlying");
        }
    }

    /////////////////////////////////////////////
    ////////////BASIC STRATEGY FUNCTIONS/////////
    /////////////////////////////////////////////

    /// @notice Return approximately amount of reward tokens ready to claim in Ovix Controller contract
    /// @dev Don't use it in any internal logic, only for statistical purposes
    /// @return Array with amounts ready to claim
    function readyToClaim() external view override returns (uint256[] memory) {
        uint256[] memory rewards = new uint256[](1);
        rewards[0] = IComptroller(ovixController).rewardAccrued(address(this));
        return rewards;
    }

    /// @notice TVL of the underlying in the oToken contract
    /// @dev Only for statistic
    /// @return Pool TVL
    function poolTotalAmount() external view override returns (uint256) {
        return ICompleteOToken(oToken).getCash() + (ICompleteOToken(oToken).totalBorrows()) - (ICompleteOToken(oToken).totalReserves());
    }

    /// @dev Do something useful with farmed rewards
    function liquidateReward() internal override {
        liquidateRewardDefault();
    }

    ///////////////////////////////////////////////////////////////////////////////////////
    ///////////// internal functions require specific implementation for each platforms ///
    ///////////////////////////////////////////////////////////////////////////////////////

    function _getInvestmentData() internal override returns (uint256 supplied, uint256 borrowed){
        supplied = ICompleteOToken(oToken).balanceOfUnderlying(address(this));
        borrowed = ICompleteOToken(oToken).borrowBalanceCurrent(address(this));
    }

    /// @dev Return true if we can gain profit with folding
    function _isFoldingProfitable() internal view override returns (bool) {
        (
            uint256 supplyRewardsInUSDC,
            uint256 borrowRewardsInUSDC,
            uint256 supplyUnderlyingProfitInUSDC,
            uint256 debtUnderlyingCostInUSDC
        ) = totalRewardPredictionInUSDC();

        uint256 foldingProfitPerToken = supplyRewardsInUSDC + borrowRewardsInUSDC + supplyUnderlyingProfitInUSDC;
        return foldingProfitPerToken > debtUnderlyingCostInUSDC;
    }

    /// @dev Claim distribution rewards
    function _claimReward() internal override {
        IOToken[] memory markets = new IOToken[](1);
        markets[0] = IOToken(oToken);
        IComptroller(ovixController).claimRewards(address(this), markets);
    }

    function _supply(uint256 amount) internal override {
        amount = Math.min(IERC20(_underlyingToken).balanceOf(address(this)), amount);
        if (_isMatic()) {
            wmaticWithdraw(amount);
            IOMatic(oToken).mint{value: amount}();
        } else {
            IERC20(_underlyingToken).safeApprove(oToken, 0);
            IERC20(_underlyingToken).safeApprove(oToken, amount);
            require(ICompleteOToken(oToken).mint(amount) == 0, "OFS: Supplying failed");
        }
    }

    function _borrow(uint256 amountUnderlying) internal override {
        // Borrow, check the balance for this contract's address
        require(ICompleteOToken(oToken).borrow(amountUnderlying) == 0, "OFS: Borrow failed");
        if (_isMatic()) {
            IWmatic(ovixFoldStrategyAddress.W_MATIC()).deposit{value: address(this).balance}();
        }
    }

    function _redeemUnderlying(uint256 amountUnderlying) internal override {
        amountUnderlying = Math.min(amountUnderlying, _maxRedeem());
        if (amountUnderlying > 0) {
            uint256 redeemCode = 999;
            try ICompleteOToken(oToken).redeemUnderlying(amountUnderlying) returns (uint256 code) {
                redeemCode = code;
            } catch {}
            if (redeemCode != 0) {
                // ovix has verification function that can ruin tx with underlying, in this case redeem oToken will work
                (, , , uint256 exchangeRate) = ICompleteOToken(oToken).getAccountSnapshot(address(this));
                uint256 oTokenRedeem = (amountUnderlying * _PRECISION) / exchangeRate;
                if (oTokenRedeem > 0) {
                    _redeemLoanToken(oTokenRedeem);
                }
            }
            if (_isMatic()) {
                IWmatic(ovixFoldStrategyAddress.W_MATIC()).deposit{value: address(this).balance}();
            }
        }
    }

    function _redeemLoanToken(uint256 amount) internal {
        if (amount > 0) {
            require(ICompleteOToken(oToken).redeem(amount) == 0, "OFS: Redeem failed");
        }
    }

    function _repay(uint256 amountUnderlying) internal override {
        if (amountUnderlying != 0) {
            if (_isMatic()) {
                wmaticWithdraw(amountUnderlying);
                IOMatic(oToken).repayBorrow{value: amountUnderlying}();
            } else {
                IERC20(_underlyingToken).safeApprove(oToken, 0);
                IERC20(_underlyingToken).safeApprove(oToken, amountUnderlying);
                require(ICompleteOToken(oToken).repayBorrow(amountUnderlying) == 0,"OFS: Repay failed");
            }
        }
    }

    /// @dev Redeems the maximum amount of underlying. Either all of the balance or all of the available liquidity.
    function _redeemMaximumWithLoan() internal override {
        uint256 supplied = ICompleteOToken(oToken).balanceOfUnderlying(address(this));
        uint256 borrowed = ICompleteOToken(oToken).borrowBalanceCurrent(address(this));
        uint256 balance = supplied + borrowed;
        _redeemPartialWithLoan(balance);

        // we have a little amount of supply after full exit
        // better to redeem oToken amount for avoid rounding issues
        (, uint256 oTokenBalance, , ) = ICompleteOToken(oToken).getAccountSnapshot(address(this));
        if (oTokenBalance > 0) {
            _redeemLoanToken(oTokenBalance);
        }
    }

    /////////////////////////////////////////////
    ////////////SPECIFIC INTERNAL FUNCTIONS//////
    /////////////////////////////////////////////

    function decimals() private view returns (uint8) {
        return ICompleteOToken(oToken).decimals();
    }

    function underlyingDecimals() private view returns (uint8) {
        return IERC20Extended(_underlyingToken).decimals();
    }

    /// @notice returns forecast of all rewards (OVIX and underlying) for the given period of time
    function totalRewardPrediction() private view returns (uint256 supplyRewards, uint256 borrowRewards, uint256 supplyUnderlyingProfit, uint256 debtUnderlyingCost){
        ICompleteOToken rt = ICompleteOToken(oToken);
        // get reward per token for both - suppliers and borrowers
        uint256 rewardSpeed = IComptroller(ovixController).rewardSpeeds(oToken);
        // get total supply, cash and borrows, and normalize them to 18 decimals
        uint256 totalSupply = (rt.totalSupply() * _PRECISION) / (10**decimals());
        uint256 totalBorrows = (rt.totalBorrows() * _PRECISION) / (10**underlyingDecimals());

        if (totalSupply == 0 || totalBorrows == 0) {
            return (0, 0, 0, 0);
        }

        // exchange rate between oToken and underlyingToken
        uint256 oTokenExchangeRate = (rt.exchangeRateStored() * 10**decimals()) / 10**underlyingDecimals();
        // amount of reward tokens per block for 1 supplied underlyingToken
        supplyRewards = (((rewardSpeed * _PRECISION) / oTokenExchangeRate) * _PRECISION) / totalSupply;
        // amount of reward tokens per block for 1 borrowed underlyingToken
        borrowRewards = (rewardSpeed * _PRECISION) / totalBorrows;
        supplyUnderlyingProfit = rt.supplyRatePerTimestamp();
        debtUnderlyingCost = rt.borrowRatePerTimestamp();
        return (supplyRewards, borrowRewards, supplyUnderlyingProfit, debtUnderlyingCost);
    }

    /// @notice returns forecast of all rewards (OVIX and underlying)
    ///         for the given period of time in USDC token using OVIX pr oracle
    function totalRewardPredictionInUSDC() private view returns (uint256 supplyRewardsInUSDC, uint256 borrowRewardsInUSDC, uint256 supplyUnderlyingProfitInUSDC, uint256 debtUnderlyingCostInUSDC) {
        uint256 rewardTokenUSDC = IPriceOracle(IComptroller(ovixController).oracle()).getUnderlyingPrice(ovixFoldStrategyAddress.O_USDC());
        uint256 oTokenUSDC = oTokenUnderlyingPrice(oToken);

        (uint256 supplyRewards, uint256 borrowRewards, uint256 supplyUnderlyingProfit, uint256 debtUnderlyingCost) = totalRewardPrediction();

        supplyRewardsInUSDC = (supplyRewards * rewardTokenUSDC) / _PRECISION;
        borrowRewardsInUSDC = (borrowRewards * rewardTokenUSDC) / _PRECISION;

        supplyUnderlyingProfitInUSDC = (supplyUnderlyingProfit * oTokenUSDC) / _PRECISION;
        debtUnderlyingCostInUSDC = (debtUnderlyingCost * oTokenUSDC) / _PRECISION;
    }

    /// @dev Return oToken price from Ovix Oracle solution. Can be used on-chain safely
    function oTokenUnderlyingPrice(address _oToken) public view returns (uint256) {
        uint256 _oTokenPrice = IPriceOracle(IComptroller(ovixController).oracle()).getUnderlyingPrice(IOToken(_oToken));
        // normalize token price to _PRECISION
        if (underlyingDecimals() < 18) {
            _oTokenPrice = _oTokenPrice / (10**(18 - underlyingDecimals()));
        }
        return _oTokenPrice;
    }

    function wmaticWithdraw(uint256 amount) private {
        require(IERC20(ovixFoldStrategyAddress.W_MATIC()).balanceOf(address(this)) >= amount, "OFS: Not enough wmatic");
        IWmatic(ovixFoldStrategyAddress.W_MATIC()).withdraw(amount);
    }

    function _isMatic() internal view returns (bool) {
        return oToken == ovixFoldStrategyAddress.O_MATIC();
    }

    /////////////////////////////////////////////
    /////////////////GOVERNANCE//////////////////
    /////////////////////////////////////////////

    function setFoldStrategyAddress(address _addr) external onlyControllerOrGovernance{
        ovixFoldStrategyAddress = IOvixFoldStrategy(_addr);
    }
}
