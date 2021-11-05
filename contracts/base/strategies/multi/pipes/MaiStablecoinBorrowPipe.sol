// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
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
    using SafeMath for uint256;

    /// @dev creates context
    function create(MaiStablecoinBorrowPipeData memory d) public pure returns (bytes memory) {
        return abi.encode(
            d.stablecoin, d.vaultID, d.borrowedToken, d.targetPercentage, d.maxImbalance
        );
    }

    /// @dev decodes context
    /// @param c abi-encoded context
    function context(bytes memory c)
    internal pure returns (
        address stablecoin,
        uint256 vaultID,
        address borrowedToken,
        uint16 targetPercentage,
        uint16 maxImbalance
    ) {
        (stablecoin, vaultID, borrowedToken, targetPercentage, maxImbalance) =
        abi.decode(c, (address, uint256, address, uint16, uint16));
    }

    /// @dev Borrow tokens
    /// @param c abi-encoded context
    /// @param amount in source units
    /// @return output in underlying units
    function _put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address stablecoin, uint256 vaultID, address borrowedToken, uint16 targetPercentage,) = context(c);
        console.log('MaiStablecoinBorrowPipe _put vaultID, amount', vaultID, amount);
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(stablecoin);
        uint256 before = IERC20(borrowedToken).balanceOf(address(this));

        uint256 collateral = amount;
        uint256 maiDecimals = uint256(IERC20Metadata(_stablecoin.mai()).decimals());
        uint256 collateralDecimals = uint256(IERC20Metadata(_stablecoin.collateral()).decimals());
        uint256 collateralUsdValue = collateral.mul(_stablecoin.getEthPriceSource())
        .mul(10 ** (maiDecimals.sub(collateralDecimals))).div(_stablecoin.getTokenPriceSource());
        uint256 borrowAmount = collateralUsdValue.mul(100).div(targetPercentage);
        console.log('borrowAmount', borrowAmount);
        console.log('ownerOf(vaultID)', _stablecoin.ownerOf(vaultID));
        console.log('address(this)   ', address(this));
        console.log('msg.sender      ', msg.sender);
        IErc20Stablecoin(stablecoin).borrowToken(vaultID, borrowAmount);

        uint256 current = IERC20(borrowedToken).balanceOf(address(this));
        console.log('current', current);
        output = current.sub(before);
    }

    /// @dev Repay borrowed tokens
    /// @param c abi-encoded context
    /// @param amount in underlying units
    /// @return output in source units
    function _get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address stablecoin, uint256 vaultID,,uint16 targetPercentage,) = context(c);

        IErc20Stablecoin _stablecoin = IErc20Stablecoin(stablecoin);
        uint256 debt = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);

        uint256 repay = Math.min(amount, debt);
        _stablecoin.payBackToken(vaultID, repay);

        uint256 current = _stablecoin.vaultDebt(vaultID);
        uint256 returned = debt.sub(current);
        uint256 unlocked = returned.mul(targetPercentage).div(100);

        uint256 maiDecimals = uint256(IERC20Metadata(_stablecoin.mai()).decimals());
        uint256 collateralDecimals = uint256(IERC20Metadata(_stablecoin.collateral()).decimals());

        output = unlocked.mul(_stablecoin.getTokenPriceSource())
        .div(10 ** (maiDecimals.sub(collateralDecimals))).div(_stablecoin.getEthPriceSource());

    }

    /// @dev available ETH (MATIC) source balance
    /// @param c abi-encoded context
    /// @return balance in source units (collateral) we can withdraw and keep collateral to debt target percentage
    function _sourceBalance(bytes memory c) override public view returns (uint256) {
        (address stablecoin, uint256 vaultID,,uint16 targetPercentage,) = context(c);
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(stablecoin);

        uint256 debt = _stablecoin.vaultDebt(vaultID);
        if (debt == 0) {// no debt
            return _stablecoin.vaultCollateral(vaultID);
        }

        uint256 minCollateral = debt.mul(100).div(targetPercentage);
        //TODO Value usdt
        uint256 collateral = _stablecoin.vaultCollateral(vaultID);
        if (collateral <= minCollateral) return 0;

        return collateral.sub(minCollateral);
    }

    /// @dev underlying balance (LP token)
    /// @param c abi-encoded context
    /// @return balance in underlying units
    function _underlyingBalance(bytes memory c) override public view returns (uint256) {
        (,, address borrowedToken,,) = context(c);
        return IERC20(borrowedToken).balanceOf(address(this));
    }

    /// @dev function for re balancing. When rebalance
    /// @param c abi-encoded context
    /// @return imbalance in underlying units
    /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function _rebalance(bytes memory c) override public returns (uint256 imbalance, bool deficit) {
        (address stablecoin, uint256 vaultID, address borrowedToken, uint16 targetPercentage, uint16 maxImbalance) = context(c);

        //TODO when stablecoin.checkLiquidation? and call stablecoin.getPaid() when liquidated
        uint256 collateralPercentage = IErc20Stablecoin(stablecoin).checkCollateralPercentage(vaultID);
        if (collateralPercentage == 0) return (0, false);
        // no debt or collateral

        if (collateralPercentage.add(maxImbalance) < targetPercentage) {

            uint256 targetBorrow = _percentageToBorrowTokenAmount(c, targetPercentage);
            uint256 debt = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);
            uint256 repay = debt.sub(targetBorrow);

            uint256 available = IERC20(borrowedToken).balanceOf(address(this));
            uint256 amount = Math.min(repay, available);
            if (amount > 0) {
                _get(c, amount);
            }

            uint256 change = IERC20(borrowedToken).balanceOf(address(this));
            if (change > 0) {
                return (change, false);
            } else {
                return (repay.sub(amount), true);
            }

        } else if (collateralPercentage > uint256(targetPercentage).add(maxImbalance)) {

            uint256 targetBorrow = _percentageToBorrowTokenAmount(c, targetPercentage);
            uint256 debt = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);
            uint256 borrow = targetBorrow.sub(debt);
            if (borrow > 0) {
                _put(c, borrow);
            }
            uint256 surplus = IERC20(borrowedToken).balanceOf(address(this));
            return (surplus, false);

        }

        return (0, false);
        // in balance
    }

    function _percentageToBorrowTokenAmount(bytes memory c, uint256 percentage) private view returns (uint256 amount) {
        (address stablecoin, uint256 vaultID,,,) = context(c);
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(stablecoin);

        uint256 collateral = _stablecoin.vaultCollateral(vaultID);
        uint256 maiDecimals = uint256(IERC20Metadata(_stablecoin.mai()).decimals());
        uint256 collateralDecimals = uint256(IERC20Metadata(_stablecoin.collateral()).decimals());
        uint256 collateralValue = collateral.mul(_stablecoin.getEthPriceSource())
        .mul(10 ** (maiDecimals.sub(collateralDecimals)));

        amount = collateralValue.div(_stablecoin.getTokenPriceSource()).mul(percentage).div(100);
    }

}
