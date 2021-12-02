// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Pipe.sol";
import "./../../../../third_party/aave/ILendingPool.sol";

import "hardhat/console.sol";

    struct AaveAmPipeData {
        address pool;
        address sourceToken;
        address lpToken;
        address rewardToken;
    }

/// @title Aave Weth Pipe Contract
/// @author bogdoslav
contract AaveAmPipe is Pipe {
    using SafeERC20 for IERC20;

    AaveAmPipeData public d;

    constructor(AaveAmPipeData memory _d) Pipe() {
        name = 'AaveAmPipe';
        d = _d;
        sourceToken = _d.sourceToken;
        outputToken = _d.lpToken;
        rewardToken = _d.rewardToken;
    }

    /// @dev Deposits to Aave
    /// @param amount to deposit (TOKEN)
    /// @return output amount of output units (amTOKEN)
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('AaveAmPipe put amount', amount);
        ERC20Approve(sourceToken, d.pool, amount);
        ILendingPool(d.pool).deposit(sourceToken, amount, address(this), 0);

        output = ERC20Balance(outputToken);
        transferERC20toNextPipe(outputToken, output);
    }

    /// @dev Withdraws from Aave
    /// @param amount to withdraw
    /// @return output amount of source token
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('AaveAmPipe get amount', amount);

        ERC20Approve(outputToken, d.pool, amount);
        ILendingPool(d.pool).withdraw(sourceToken, amount, address(this));

        output = ERC20Balance(sourceToken);
        transferERC20toPrevPipe(sourceToken, output);
    }

}
