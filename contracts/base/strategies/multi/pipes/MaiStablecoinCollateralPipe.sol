// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "./Pipe.sol";
import "./../../../../third_party/qudao-mai/IErc20Stablecoin.sol";

import "hardhat/console.sol"; //TODO rm

struct MaiStablecoinCollateralPipeData {
    address sourceToken;
    address stablecoin; //Erc20Stablecoin contract address
    uint256 vaultID;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract MaiStablecoinCollateralPipe is Pipe {
    using SafeERC20 for IERC20;

    MaiStablecoinCollateralPipeData public d;
    IErc20Stablecoin private _stablecoin;

    constructor(MaiStablecoinCollateralPipeData memory _d) Pipe() {
        d = _d;
        _stablecoin = IErc20Stablecoin(d.stablecoin);
        d.vaultID = IErc20Stablecoin(d.stablecoin).createVault();
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) override onlyOwner public returns (uint256 output) {
        uint256 before = _stablecoin.vaultCollateral(d.vaultID);

        IERC20(d.sourceToken).safeApprove(d.stablecoin, 0);
        IERC20(d.sourceToken).safeApprove(d.stablecoin, amount);
        _stablecoin.depositCollateral(d.vaultID, amount);

        uint256 current = _stablecoin.vaultCollateral(d.vaultID);
        output = current - before;
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) override onlyOwner public returns (uint256 output) {
        uint256 before = ERC20Balance(d.sourceToken);

        _stablecoin.withdrawCollateral(d.vaultID, amount);

        uint256 current = ERC20Balance(d.sourceToken);
        output = current - before;

        transferERC20toPrevPipe(d.sourceToken, output);//TODO or all current balance?
    }

    /// @dev available ETH (MATIC) source balance
    /// @return balance in source units
    function sourceBalance() override public view returns (uint256) {
        return ERC20Balance(d.sourceToken);
    }

    /// @dev underlying balance (LP token)
    /// @return balance in underlying units
    function underlyingBalance() override public view returns (uint256) {
        return _stablecoin.vaultCollateral(d.vaultID);
    }

}
