// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./Pipe.sol";
import "./../../../../third_party/qudao-mai/IErc20Stablecoin.sol";

import "hardhat/console.sol"; //TODO rm

    struct MaiStablecoinPipeData {
        address sourceToken;
        address stablecoin; //Erc20Stablecoin contract address
        // borrowing
        address borrowToken; // mai (miMATIC) for example
        uint256 targetPercentage; // Collateral to Debt percentage
        uint256 maxImbalance;     // Maximum Imbalance in percents
        address rewardToken;
    }

/// @title Mai Stablecoin Pipe Contract
/// @author bogdoslav
contract MaiStablecoinPipe is Pipe {
    using SafeERC20 for IERC20;

    MaiStablecoinPipeData public d;
    IErc20Stablecoin private _stablecoin;
    uint256 vaultID;

    uint256 public mockEthPriceSource = 0; // used for testing purposes only

    constructor(MaiStablecoinPipeData memory _d) Pipe() {
        name = 'MaiStablecoinPipe';
        d = _d;
        sourceToken = _d.sourceToken;
        outputToken = _d.borrowToken;
        rewardToken = _d.rewardToken;
        _stablecoin = IErc20Stablecoin(d.stablecoin);
        vaultID = IErc20Stablecoin(d.stablecoin).createVault();
    }

    /// @dev Sets targetPercentage
    /// @param _targetPercentage - target collateral to debt percentage
    function setTargetPercentage(uint256 _targetPercentage) onlyPipeline public {
        d.targetPercentage = _targetPercentage;
    }

    /// @dev Gets targetPercentage
    /// @return collateral to debt percentage
    function targetPercentage() external view returns (uint256) {
        return d.targetPercentage;
    }

    /// @dev function for depositing to collateral then borrowing
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('MaiStablecoinPipe put amount', amount);
        depositCollateral(amount);
        uint256 borrowAmount = _collateralToBorrowTokenAmountPercentage(amount, d.targetPercentage);
        console.log('borrow   ', borrowAmount);
        borrow(borrowAmount);
        output = ERC20Balance(outputToken);
        transferERC20toNextPipe(d.borrowToken, output);
    }

    /// @dev function for repaying debt then withdrawing from collateral
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('MaiStablecoinPipe get amount', amount);
        uint256 borrowTokenAmount = ERC20Balance(d.borrowToken);
        console.log('borrowTokenAmount', borrowTokenAmount);

        uint256 repaidAmount = repay(amount);

        uint256 withdrawAmount = _borrowToCollateralTokenAmountPercentage(repaidAmount, d.targetPercentage);
        console.log('withdrawAmount', withdrawAmount);

        uint256 collateralBefore = _stablecoin.vaultCollateral(vaultID);
        //TODO
        console.log('-collateralBefore   ', collateralBefore);
        //TODO
        withdrawCollateral(withdrawAmount);
        uint256 collateralCurrent = _stablecoin.vaultCollateral(vaultID);
        //TODO
        console.log('-collateralCurrent  ', collateralCurrent);
        //TODO

        output = ERC20Balance(sourceToken);
        transferERC20toPrevPipe(sourceToken, output);
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    function depositCollateral(uint256 amount) private {
        console.log('*depositCollateral amount', amount);
        ERC20Approve(d.sourceToken, d.stablecoin, amount);
        _stablecoin.depositCollateral(vaultID, amount);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in underlying units
    function withdrawCollateral(uint256 amount) private {
        console.log('*withdrawCollateral amount', amount);
        _stablecoin.withdrawCollateral(vaultID, amount);
    }

    /// @dev Borrow tokens
    /// @param borrowAmount in underlying units
    function borrow(uint256 borrowAmount) private {
        console.log('*borrowAmount', borrowAmount);
        _stablecoin.borrowToken(vaultID, borrowAmount);
    }

    /// @dev Repay borrowed tokens
    /// @param amount in borrowed tokens
    /// @return output in borrowed tokens
    function repay(uint256 amount) private returns (uint256 output) {
        console.log('*repay amount', amount);
        uint256 debt = _stablecoin.vaultDebt(vaultID);
        console.log('debt        ', debt);

        uint256 repayAmount = Math.min(amount, debt);
        console.log('repay Amount', repayAmount);
        ERC20Approve(d.borrowToken, d.stablecoin, amount);
        _stablecoin.payBackToken(vaultID, repayAmount);
        output = repayAmount;
    }

    /* function collateralDecimals() internal view returns (uint256) {
         return uint256(IERC20Metadata(_stablecoin.collateral()).decimals());
     }

     function borrowDecimals() internal view returns (uint256) {
         return uint256(IERC20Metadata(_stablecoin.mai()).decimals());
     }*/

    /// @dev Returns true when rebalance needed
    function needsRebalance() override public view
    returns (bool){
        uint256 collateralPercentage = _stablecoin.checkCollateralPercentage(vaultID);
        if (collateralPercentage == 0) {
            return false;
            // no debt or collateral
        }
        return ((collateralPercentage + d.maxImbalance) < d.targetPercentage)
        || (collateralPercentage > (uint256(d.targetPercentage) + d.maxImbalance));
    }

    /// @dev function for re balancing. When rebalance
    /// @return imbalance in underlying units
    /// @return deficit - when true, then asks to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function rebalance() override onlyPipeline public returns (uint256 imbalance, bool deficit) {
        uint256 collateralPercentage = _stablecoin.checkCollateralPercentage(vaultID);
        if (collateralPercentage == 0) {
            return (0, false);
            // no debt or collateral
        }

        if ((collateralPercentage + d.maxImbalance) < d.targetPercentage) {
            // we have deficit
            uint256 targetBorrow = _percentageToBorrowTokenAmount(d.targetPercentage);
            console.log('targetBorrow', targetBorrow);
            uint256 debt = _stablecoin.vaultDebt(vaultID);
            console.log('debt', debt);
            uint256 repayAmount = debt - targetBorrow;
            console.log('repayAmount', repayAmount);

            uint256 available = ERC20Balance(d.borrowToken);
            console.log('available', available);
            uint256 paidAmount = Math.min(repayAmount, available);
            console.log('paidAmount', paidAmount);
            if (paidAmount > 0) {
                repay(paidAmount);
            }

            uint256 change = ERC20Balance(d.borrowToken);
            console.log('change', change);
            if (change > 0) {
                transferERC20toNextPipe(d.borrowToken, change);
                return (change, false);
            } else {
                return (repayAmount - paidAmount, true);
            }

        } else if (collateralPercentage > (uint256(d.targetPercentage) + d.maxImbalance)) {
            // we have excess
            uint256 targetBorrow = _percentageToBorrowTokenAmount(d.targetPercentage);
            console.log('   targetBorrow', targetBorrow);
            uint256 debt = _stablecoin.vaultDebt(vaultID);
            console.log('   debt', debt);
            if (debt < targetBorrow) {
                borrow(targetBorrow - debt);
            }
            uint256 excess = ERC20Balance(d.borrowToken);
            console.log('   excess', excess);
            transferERC20toNextPipe(d.borrowToken, excess);
            return (excess, false);
        }

        return (0, false);
        // in balance
    }

    /// @dev Converts percentage to borrow token amount
    /// @param percentage target collateral to debt percentage
    /// @return borrowAmount amount of borrow token for target percentage
    function _percentageToBorrowTokenAmount(uint256 percentage) private view returns (uint256 borrowAmount) {
        console.log('_percentageToBorrowTokenAmount percentage', percentage);
        uint256 collateral = _stablecoin.vaultCollateral(vaultID);
        console.log('_collateral', collateral);
        borrowAmount = _collateralToBorrowTokenAmountPercentage(collateral, percentage);
        console.log('_borrow    ', borrowAmount);
    }

    /// @dev Gets current eth (matic) price
    /// @return current or mocked eth (matic) price
    function getEthPriceSource() internal view returns (uint256) {
        if (mockEthPriceSource != 0) {
            return mockEthPriceSource;
        } else {
            return _stablecoin.getEthPriceSource();
        }
    }

    ///TODO how to disable it at production? Mey be we have some modifier
    /// @dev Sets mock eth (matic) price for re-balance testing. do not use it at production
    /// @param _mockEthPriceSource new mock eth (matic) price. Set to 0 to disable mocking
    function setMockEthPriceSource(uint256 _mockEthPriceSource) external onlyPipeline {
        mockEthPriceSource = _mockEthPriceSource;
    }

    /// @dev Shows current eth (matic) price
    /// @return current or mocked eth (matic) price
    function ethPriceSource() public view returns (uint256) {
        return getEthPriceSource();
    }

    /// @dev Converts collateral amount to borrow amount using target Collateral to Debt percentage
    /// @param collateral amount in collateral token
    /// @param percentage is Collateral to Debt percentage from 135 and above
    function _collateralToBorrowTokenAmountPercentage(uint256 collateral, uint256 percentage)
    private view returns (uint256 amount) {
        console.log('_collateralPercentageToBorrowTokenAmount collateral, percentage', collateral, percentage);

        uint256 ethPrice = getEthPriceSource();
        console.log('_ethPrice', ethPrice);

        uint256 value = collateral * ethPrice / _stablecoin.getTokenPriceSource();
        console.log('_value', value);

        //        amount = toDecimals(value * 100 / percentage, collateralDecimals(), borrowDecimals());
        amount = value * 100 / percentage;
        console.log('_return borrow', amount);
    }

    /// @dev converts borrow amount to collateral amount using target Collateral to Debt percentage
    /// @param borrowAmount amount in borrow token
    /// @param percentage is Collateral to Debt percentage from 135 and above
    function _borrowToCollateralTokenAmountPercentage(uint256 borrowAmount, uint256 percentage)
    private view returns (uint256 amount) {
        console.log('_borrowToCollateralTokenAmountPercentage borrowAmount, percentage', borrowAmount, percentage);

        uint256 ethPrice = getEthPriceSource();
        console.log('_ethPrice', ethPrice);
        uint256 tokenPriceSource = _stablecoin.getTokenPriceSource();
        uint256 closingFee = _stablecoin.closingFee();

        // from https://github.com/0xlaozi/qidao/blob/308754139e0d701bdd2c8d4f66ae14ef8b2acdca/contracts/Stablecoin.sol#L212
        uint256 fee = (borrowAmount * closingFee * tokenPriceSource) / (ethPrice * 10000);
        console.log('_fee           ', fee);
        uint256 value = borrowAmount * tokenPriceSource / ethPrice;
        console.log('_value         ', value);

        //        amount = toDecimals(value * percentage / 100 - fee, collateralDecimals(), borrowDecimals());
        amount = value * percentage / 100 - fee;

        console.log('_return collateral', amount);
    }


}
