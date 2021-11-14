// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Pipe.sol";
import "./../../../../third_party/aave/IWETHGateway.sol";

import "hardhat/console.sol";

struct AaveWethPipeData {
    address wethGateway;
    address pool;
    address lpToken;
    address rewardToken;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract AaveWethPipe is Pipe {
    using SafeERC20 for IERC20;

    AaveWethPipeData public d;

    constructor(AaveWethPipeData memory _d) Pipe() {
        name = 'AaveWethPipe';
        d = _d;
        sourceToken = _ETHER;
        outputToken = _d.lpToken;
        rewardToken = _d.rewardToken;
    }

    /// @dev function for investing, deposits, entering, borrowing
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('AaveWethPipe put amount', amount);
        uint256 before = ERC20Balance(outputToken);

        IWETHGateway(d.wethGateway).depositETH{value:amount}(d.pool, address(this), 0);

        uint256 current = ERC20Balance(outputToken);
        output = current - before;

        transferERC20toNextPipe(outputToken, current);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('AaveWethPipe get amount', amount);

        uint256 before = address(this).balance;

        ERC20Approve(outputToken, d.wethGateway, amount);
        IWETHGateway(d.wethGateway).withdrawETH(d.pool, amount, address(this));

        uint256 current = address(this).balance;
        output = current - before;

        if (havePrevPipe()) {
            payable(payable(address(prevPipe))).transfer(current);
        }
    }

    /// @dev available ETH (MATIC) source balance
    /// @return balance in source units
    function sourceBalance() override public view returns (uint256) {
        return address(this).balance;
    }

    /// @dev to receive Ether (Matic)
    receive() external payable {}

}
