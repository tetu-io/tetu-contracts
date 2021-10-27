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

    struct MaiStablecoinBorrowPipeData {
        address stablecoin; //Erc20Stablecoin contract address
        uint256 vaultID;
        address borrowedToken; // mai (miMATIC) for example
        uint16 minPercentage;
        uint16 maxPercentage;
        uint16 targetPercentage;
    }

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract MaiStablecoinBorrowPipe is Pipe {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// @dev creates context
    function create(MaiStablecoinBorrowPipeData memory d) public pure returns (bytes memory) {
        return abi.encode(
            d.stablecoin, d.vaultID, d.borrowedToken, d.minPercentage, d.maxPercentage, d.targetPercentage
        );
    }

    /// @dev decodes context
    /// @param c abi-encoded context
    function context(bytes memory c)
    internal pure returns (
        address stablecoin,
        uint256 vaultID,
        address borrowedToken,
        uint16 minPercentage,
        uint16 maxPercentage,
        uint16 targetPercentage
    ) {
        (stablecoin, vaultID, borrowedToken, minPercentage, maxPercentage, targetPercentage) =
            abi.decode(c, (address, uint256, address, uint16, uint16, uint16));
    }

    /// @dev Borrow tokens
    /// @param c abi-encoded context
    /// @param amount in source units
    /// @return output in underlying units
    function _put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address stablecoin, uint256 vaultID, address borrowedToken,,,) = context(c);
        uint256 before = IERC20(borrowedToken).balanceOf(address(this)); //TODO!!!

        IErc20Stablecoin(stablecoin).borrowToken(vaultID, amount);

        uint256 current = IERC20(borrowedToken).balanceOf(address(this));
        output = current.sub(before);
    }

    /// @dev Repay borrowed tokens
    /// @param c abi-encoded context
    /// @param amount in underlying units
    /// @return output in source units
    function _get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address stablecoin, uint256 vaultID,,,,) = context(c);
        uint256 before = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);

        IErc20Stablecoin(stablecoin).payBackToken(vaultID, amount);

        uint256 current = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);
        output = before.sub(current); // as it is debt, it is less after repay
    }

    /// @dev available ETH (MATIC) source balance
    /// @param c abi-encoded context
    /// @return balance in source units
    function _sourceBalance(bytes memory c) override public view returns (uint256) {
        (address stablecoin, uint256 vaultID,,,,) = context(c);
        return IErc20Stablecoin(stablecoin).vaultDebt(vaultID);
    }

    /// @dev underlying balance (LP token)
    /// @param c abi-encoded context
    /// @return balance in underlying units
    function _underlyingBalance(bytes memory c) override public view returns (uint256) {
        (,, address borrowedToken,,,) = context(c);
        return IERC20(borrowedToken).balanceOf(address(this));
    }

    /// @dev function for re balancing. When rebalance
    /// @param c abi-encoded context
    /// @return imbalance in underlying units
    /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function _rebalance(bytes memory c) override public returns (uint256 imbalance, bool deficit) {
        (address stablecoin, uint256 vaultID, address borrowedToken, uint16 minPercentage, uint16 maxPercentage, uint16 targetPercentage) = context(c);

        //TODO when stablecoin.checkLiquidation? and call stablecoin.getPaid() when liquidated
        uint256 collateralPercentage = IErc20Stablecoin(stablecoin).checkCollateralPercentage(vaultID);
        if (collateralPercentage==0) return (0,false); // no debt or collateral

        if (collateralPercentage<=minPercentage) {

            uint256 targetBorrow = _percentageToBorrowTokenAmount(c, targetPercentage);
            uint256 debt = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);
            uint256 repay = debt.sub(targetBorrow);

            uint256 available = IERC20(borrowedToken).balanceOf(address(this));
            uint256 amount = Math.min(repay, available);
            if (amount>0) {
                _get(c, amount);
            }

            uint256 change = IERC20(borrowedToken).balanceOf(address(this));
            if (change>0) {
                return (change, false);
            } else {
                return (repay.sub(amount), true);
            }

        } else if (collateralPercentage>=maxPercentage) {

            uint256 targetBorrow = _percentageToBorrowTokenAmount(c, targetPercentage);
            uint256 debt = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);
            uint256 borrow = targetBorrow.sub(debt);
            if (borrow>0) {
                _put(c, borrow);
            }
            uint256 surplus = IERC20(borrowedToken).balanceOf(address(this));
            return (surplus,false);

        }

        return (0,false); // in balance
    }

    function _percentageToBorrowTokenAmount(bytes memory c, uint256 percentage) private view returns (uint256 amount) {
        (address stablecoin, uint256 vaultID,,,,) = context(c);
        IErc20Stablecoin _stablecoin = IErc20Stablecoin(stablecoin);

        uint256 collateral  = _stablecoin.vaultCollateral(vaultID);
        uint256 maiDecimals = uint256(IERC20Metadata(_stablecoin.mai()).decimals());
        uint256 collateralDecimals = uint256(IERC20Metadata(_stablecoin.collateral()).decimals());
        uint256 collateralValue = collateral.mul(_stablecoin.getEthPriceSource())
        .mul(10**(maiDecimals.sub(collateralDecimals)));

        amount = collateralValue.div(_stablecoin.getTokenPriceSource()).mul(percentage).div(100);
    }

}
