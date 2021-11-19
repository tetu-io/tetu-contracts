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

/// @title Aave Weth Pipe Contract
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

    /// @dev Deposits MATIC to Aave
    /// @param amount to deposit (MATIC)
    /// @return output amount of output units (amMATIC)
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('AaveWethPipe put amount', amount);
        IWETHGateway(d.wethGateway).depositETH{value : amount}(d.pool, address(this), 0);

        output = ERC20Balance(outputToken);
        transferERC20toNextPipe(outputToken, output);
    }

    /// @dev Withdraws MATIC from Aave
    /// @param amount to unwrap
    /// @return output amount of source units (MATIC)
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('AaveWethPipe get amount', amount);

        ERC20Approve(outputToken, d.wethGateway, amount);
        IWETHGateway(d.wethGateway).withdrawETH(d.pool, amount, address(this));

        output = address(this).balance;
        if (havePrevPipe()) {
            payable(payable(address(prevPipe))).transfer(output);
        }
    }

    /// @dev available MATIC source balance
    /// @return balance in source units
    function sourceBalance() override public view returns (uint256) {
        return address(this).balance;
    }

    /// @dev to receive Ether (Matic) from Aave
    receive() external payable {}

}
