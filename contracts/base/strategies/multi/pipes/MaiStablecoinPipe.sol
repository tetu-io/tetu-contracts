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
    uint16 targetPercentage; // Collateral to Debt percentage
    uint16 maxImbalance;     // Maximum Imbalance in percents
    address rewardToken;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract MaiStablecoinPipe is Pipe {
    using SafeERC20 for IERC20;

    MaiStablecoinPipeData public d;
    IErc20Stablecoin private _stablecoin;
    uint256 vaultID;

    constructor(MaiStablecoinPipeData memory _d) Pipe() {
        name = 'MaiStablecoinPipe';
        d = _d;
        sourceToken = _d.sourceToken;
        outputToken = _d.borrowToken;
        rewardToken = _d.rewardToken;
        _stablecoin = IErc20Stablecoin(d.stablecoin);
        vaultID = IErc20Stablecoin(d.stablecoin).createVault();
    }

    /// @dev function for depositing to collateral then borrowing
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('MaiStablecoinPipe put amount', amount);
        uint256 depositedCollateralAmount = depositCollateral(amount);
        output = borrow(depositedCollateralAmount);

        transferERC20toNextPipe(d.borrowToken, ERC20Balance(d.borrowToken));
    }

    /// @dev function for repaying debt then withdrawing from collateral
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('MaiStablecoinPipe get amount', amount);
        uint256 withdrawAmount = repay(amount);
        output = withdrawCollateral(withdrawAmount);

        transferERC20toPrevPipe(d.sourceToken, ERC20Balance(d.sourceToken));
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    /// @return output in underlying units
    function depositCollateral(uint256 amount) private returns (uint256 output) {
        uint256 before = _stablecoin.vaultCollateral(vaultID);

        IERC20(d.sourceToken).safeApprove(d.stablecoin, 0);
        IERC20(d.sourceToken).safeApprove(d.stablecoin, amount);
        _stablecoin.depositCollateral(vaultID, amount);

        uint256 current = _stablecoin.vaultCollateral(vaultID);
        output = current - before;
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in underlying units
    /// @return output in source units
    function withdrawCollateral(uint256 amount) private returns (uint256 output) {
        uint256 before = ERC20Balance(d.sourceToken);

        _stablecoin.withdrawCollateral(vaultID, amount);

        uint256 current = ERC20Balance(d.sourceToken);
        output = current - before;
    }

    /// @dev available source token balance
    /// @return balance in source units
    function sourceBalance() override public view returns (uint256) {
        return ERC20Balance(d.sourceToken);
    }

    /// @dev underlying balance (borrowed token)
    /// @return balance in underlying units
    function outputBalance() override public view returns (uint256) {
        return ERC20Balance(d.borrowToken);
    }

    /// @dev Borrow tokens
    /// @param collateralAmount in source units
    /// @return output in underlying units
    function borrow(uint256 collateralAmount) private returns (uint256 output) {
        console.log('borrow collateralAmount', collateralAmount);
        uint256 borrowAmount = _collateralToBorrowTokenAmountPercentage(collateralAmount, d.targetPercentage);
        console.log('borrowAmount', borrowAmount);
        _stablecoin.borrowToken(vaultID, borrowAmount);

        output = borrowAmount;
    }

    /// @dev Repay borrowed tokens
    /// @param amount in borrowed tokens
    /// @return output in collateral tokens
    function repay(uint256 amount) private returns (uint256 output) {
        console.log('repay amount', amount);
        uint256 debt = IErc20Stablecoin(d.stablecoin).vaultDebt(vaultID);
        console.log('debt', debt);

        uint256 repayAmount = Math.min(amount, debt);
        _stablecoin.payBackToken(vaultID, repayAmount);

        uint256 current = _stablecoin.vaultDebt(vaultID);
        uint256 returned = debt - current;
        console.log('returned', returned);
//        uint256 unlocked = returned * 100 / d.targetPercentage;
//        console.log('unlocked', unlocked);

//        output = toDecimals(unlocked * _stablecoin.getEthPriceSource() / _stablecoin.getTokenPriceSource(),
//            borrowDecimals(), collateralDecimals());
        output = _borrowToCollateralTokenAmountPercentage(returned, d.targetPercentage);

        console.log('output', output);
    }

    function collateralDecimals() internal view returns (uint256) {
        return uint256(IERC20Metadata(_stablecoin.collateral()).decimals());
    }

    function borrowDecimals() internal view returns (uint256) {
        return uint256(IERC20Metadata(_stablecoin.mai()).decimals());
    }



    /// @dev function for re balancing. When rebalance
    /// @return imbalance in underlying units
    /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function rebalance() override onlyPipeline public returns (uint256 imbalance, bool deficit) {
        uint256 collateralPercentage = _stablecoin.checkCollateralPercentage(vaultID);
        if (collateralPercentage == 0) {
            return (0, false); // no debt or collateral
        }

        if ((collateralPercentage + d.maxImbalance) < d.targetPercentage) {

            uint256 targetBorrow = _percentageToBorrowTokenAmount(d.targetPercentage);
            uint256 debt = _stablecoin.vaultDebt(vaultID);
            uint256 repayAmount = debt - targetBorrow;

            uint256 available = ERC20Balance(d.borrowToken);
            uint256 paidAmount = Math.min(repayAmount, available);
            if (paidAmount > 0) {
                repay(paidAmount);
            }

            uint256 change = ERC20Balance(d.borrowToken);
            if (change > 0) {
                transferERC20toNextPipe(d.borrowToken, change);
                return (change, false);
            } else {
                return (repayAmount - paidAmount, true);
            }

        } else if (collateralPercentage > (uint256(d.targetPercentage) + d.maxImbalance)) {

            uint256 targetBorrow = _percentageToBorrowTokenAmount(d.targetPercentage);
            uint256 debt = _stablecoin.vaultDebt(vaultID);
            if (debt < targetBorrow) {
                borrow(targetBorrow - debt);
            }
            uint256 surplus = ERC20Balance(d.borrowToken);
            return (surplus, false);
        }

        return (0, false); // in balance
    }

    function _percentageToBorrowTokenAmount(uint256 percentage) private view returns (uint256 amount) {
        console.log('_percentageToBorrowTokenAmount percentage', percentage);
        uint256 collateral = _stablecoin.vaultCollateral(vaultID);
        console.log('collateral', collateral);
        amount = _collateralToBorrowTokenAmountPercentage(collateral, amount);
    }

    /// @dev converts collateral amount to borrow amount using target Collateral to Debt percentage
    /// @param collateral amount in collateral token
    /// @param percentage is Collateral to Debt percentage from 135 and above
    function _collateralToBorrowTokenAmountPercentage(uint256 collateral, uint256 percentage)
    private view returns (uint256 amount) {
        console.log('_collateralPercentageToBorrowTokenAmount collateral, percentage', collateral, percentage);

        uint256 ethPriceSource = _stablecoin.getEthPriceSource();
        console.log('ethPriceSource', ethPriceSource);

        uint256 value = collateral * ethPriceSource / _stablecoin.getTokenPriceSource();
        console.log('value', value);

        amount = toDecimals(value * 100 / percentage, collateralDecimals(), borrowDecimals());
        console.log('Borrow amount', amount);
    }

    /// @dev converts borrow amount to collateral amount using target Collateral to Debt percentage
    /// @param borrowAmount amount in borrow token
    /// @param percentage is Collateral to Debt percentage from 135 and above
    function _borrowToCollateralTokenAmountPercentage(uint256 borrowAmount, uint256 percentage)
    private view returns (uint256 amount) {
        console.log('_borrowToCollateralTokenAmountPercentage borrowAmount, percentage', borrowAmount, percentage);

        uint256 ethPriceSource = _stablecoin.getEthPriceSource();
        console.log('ethPriceSource', ethPriceSource);

        uint256 value = borrowAmount * _stablecoin.getTokenPriceSource() / ethPriceSource;
        console.log('value', value);

        amount = toDecimals(value * percentage / 100, collateralDecimals(), borrowDecimals());
        console.log('Collateral amount', amount);
    }


}
