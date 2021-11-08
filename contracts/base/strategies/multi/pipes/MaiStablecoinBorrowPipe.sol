// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Pipe.sol";
import "./../../../../third_party/qudao-mai/IErc20Stablecoin.sol";

import "hardhat/console.sol";

    struct MaiStablecoinBorrowPipeData {
        address stablecoin; //Erc20Stablecoin contract address
        uint256 vaultID;
        address borrowedToken; // mai (miMATIC) for example
        uint16 targetPercentage; // Collateral to Debt percentage
        uint16 maxImbalance;     // Maximum Imbalance in percents
    }

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract MaiStablecoinBorrowPipe is Pipe {
    using SafeERC20 for IERC20;

    MaiStablecoinBorrowPipeData public d;

    constructor(MaiStablecoinBorrowPipeData memory _d) Pipe() {
        d = _d;
    }

    /// @dev Borrow tokens
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) override onlyOwner public returns (uint256 output) {
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(d.stablecoin);
        uint256 before = ERC20Balance(d.borrowedToken);

        uint256 collateral = amount;
        uint256 maiDecimals = uint256(IERC20Metadata(_stablecoin.mai()).decimals());
        uint256 collateralDecimals = uint256(IERC20Metadata(_stablecoin.collateral()).decimals());
        uint256 collateralUsdValue = collateral * _stablecoin.getEthPriceSource()
            * 10**maiDecimals
            / 10**collateralDecimals
            / _stablecoin.getTokenPriceSource();
        uint256 borrowAmount = collateralUsdValue * 100 / d.targetPercentage;
        console.log('borrowAmount', borrowAmount);
        _stablecoin.borrowToken(d.vaultID, borrowAmount);

        uint256 current = ERC20Balance(d.borrowedToken);
        console.log('current', current);
        output = current - before;

        transferERC20toNextPipe(d.borrowedToken, output);//TODO or all current balance?
    }

    /// @dev Repay borrowed tokens
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) override onlyOwner public returns (uint256 output) {
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(d.stablecoin);
        uint256 debt = IErc20Stablecoin(d.stablecoin).vaultDebt(d.vaultID);

        uint256 repay = Math.min(amount, debt);
        _stablecoin.payBackToken(d.vaultID, repay);

        uint256 current = _stablecoin.vaultDebt(d.vaultID);
        uint256 returned = debt - current;
        uint256 unlocked = returned * d.targetPercentage / 100;

        uint256 maiDecimals = uint256(IERC20Metadata(_stablecoin.mai()).decimals());
        uint256 collateralDecimals = uint256(IERC20Metadata(_stablecoin.collateral()).decimals());

        output = unlocked * _stablecoin.getTokenPriceSource()
            * 10**maiDecimals
            / 10**collateralDecimals
            / _stablecoin.getEthPriceSource();
    }

    /// @dev available ETH (MATIC) source balance
    /// @return balance in source units (collateral) we can withdraw and keep collateral to debt target percentage
    function sourceBalance() override public view returns (uint256) {
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(d.stablecoin);

        uint256 debt = _stablecoin.vaultDebt(d.vaultID);
        if (debt == 0) {// no debt
            return _stablecoin.vaultCollateral(d.vaultID);
        }

        //TODO Value usdt
        uint256 minCollateral = debt * 100 / d.targetPercentage; //TODO !!! convert to
        uint256 collateral = _stablecoin.vaultCollateral(d.vaultID);
        if (collateral <= minCollateral) return 0;

        return collateral - minCollateral;
    }

    /// @dev underlying balance (LP token)
    /// @return balance in underlying units
    function underlyingBalance() override public view returns (uint256) {
        return ERC20Balance(d.borrowedToken);
    }

    /// @dev function for re balancing. When rebalance
    /// @return imbalance in underlying units
    /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function rebalance() override onlyOwner public returns (uint256 imbalance, bool deficit) {
        //TODO when stablecoin.checkLiquidation?
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(d.stablecoin);
        uint256 collateralPercentage = _stablecoin.checkCollateralPercentage(d.vaultID);
        if (collateralPercentage == 0) {
            return (0, false); // no debt or collateral
        }

        if ((collateralPercentage + d.maxImbalance) < d.targetPercentage) {

            uint256 targetBorrow = _percentageToBorrowTokenAmount(d.targetPercentage);
            uint256 debt = _stablecoin.vaultDebt(d.vaultID);
            uint256 repay = debt - targetBorrow;

            uint256 available = ERC20Balance(d.borrowedToken);
            uint256 amount = Math.min(repay, available);
            if (amount > 0) {
                get(amount); // TODO repay
            }

            uint256 change = ERC20Balance(d.borrowedToken);
            if (change > 0) {
                transferERC20toNextPipe(d.borrowedToken, change);
                return (change, false);
            } else {
                return (repay-amount, true);
            }

        } else if (collateralPercentage > (uint256(d.targetPercentage) + d.maxImbalance)) {

            uint256 targetBorrow = _percentageToBorrowTokenAmount(d.targetPercentage);
            uint256 debt = _stablecoin.vaultDebt(d.vaultID);
            if (debt < targetBorrow) {
                put(targetBorrow - debt); // TODO borrow
            }
            uint256 surplus = ERC20Balance(d.borrowedToken);
            return (surplus, false);
        }

        return (0, false); // in balance
    }

    function _percentageToBorrowTokenAmount(uint256 percentage) private view returns (uint256 amount) {
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(d.stablecoin);

        uint256 collateral = _stablecoin.vaultCollateral(d.vaultID);
        uint256 borrowDecimals = uint256(IERC20Metadata(d.borrowedToken).decimals());
        uint256 collateralDecimals = uint256(IERC20Metadata(_stablecoin.collateral()).decimals());

        uint256 collateralValue = collateral * _stablecoin.getEthPriceSource() *
                    (10 ** borrowDecimals) / (10 ** collateralDecimals);

        amount = collateralValue / _stablecoin.getTokenPriceSource() * percentage / 100;
    }

}
