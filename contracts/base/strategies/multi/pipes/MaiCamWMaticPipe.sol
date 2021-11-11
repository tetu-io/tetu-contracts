// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Pipe.sol";
import "./../../../../third_party/qudao-mai/ICamWMATIC.sol";

import "hardhat/console.sol";

struct MaiCamWMaticPipeData {
    address sourceToken;
    address lpToken;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract MaiCamWMaticPipe is Pipe {
    using SafeERC20 for IERC20;

    MaiCamWMaticPipeData public d;

    /// @dev creates context
    constructor(MaiCamWMaticPipeData memory _d) Pipe() {
        d = _d;
        sourceToken = _d.sourceToken;
        outputToken = _d.lpToken;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) override onlyOwner public returns (uint256 output) {
        console.log('MaiCamWMaticPipe put amount', amount);
        uint256 before = ERC20Balance(d.lpToken);

        IERC20(d.sourceToken).safeApprove(d.lpToken, 0);
        IERC20(d.sourceToken).safeApprove(d.lpToken, amount);
        ICamWMATIC(d.lpToken).enter(amount);

        uint256 current = ERC20Balance(d.lpToken);
        output = current - before;

        transferERC20toNextPipe(d.lpToken, output);//TODO or all current balance?
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) override onlyOwner public returns (uint256 output) {
        console.log('MaiCamWMaticPipe get amount', amount);
        uint256 before = ERC20Balance(d.sourceToken);

        ICamWMATIC(d.lpToken).leave(amount);

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
    function outputBalance() override public view returns (uint256) {
        return ERC20Balance(d.lpToken);
    }

}
