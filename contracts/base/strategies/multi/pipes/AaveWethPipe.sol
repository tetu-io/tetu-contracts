// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Pipe.sol";
import "./../../../../third_party/aave/IWETHGateway.sol";


struct AaveWethPipeData {
    address wethGateway;
    address pool;
    address lpToken;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract AaveWethPipe is Pipe {
    using SafeERC20 for IERC20;

    AaveWethPipeData public d;

    constructor(AaveWethPipeData memory _d) Pipe() {
        d = _d;
    }

    /// @dev function for investing, deposits, entering, borrowing
    function put(uint256 amount) override onlyOwner public returns (uint256 output) {
        uint256 before = ERC20Balance(d.lpToken);

        IWETHGateway(d.wethGateway).depositETH{value:amount}(d.pool, address(this), 0);

        uint256 current = ERC20Balance(d.lpToken);
        output = current - before;

        transferERC20toNextPipe(d.lpToken, output);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    function get(uint256 amount) override onlyOwner public returns (uint256 output) {
        IERC20(d.lpToken).safeApprove(address(d.wethGateway), 0);
        IERC20(d.lpToken).safeApprove(address(d.wethGateway), amount);
        uint256 before = address(this).balance;

        IWETHGateway(d.wethGateway).withdrawETH(d.pool, amount, address(this));

        output = address(this).balance - before;

        if (havePrevPipe()) {
            payable(payable(address(nextPipe))).transfer(output);
        }
    }

    /// @dev available ETH (MATIC) source balance
    /// @return balance in source units
    function sourceBalance() override public view returns (uint256) {
        return address(this).balance;
    }

    /// @dev underlying balance (LP token)
    /// @return balance in underlying units
    function underlyingBalance() override public view returns (uint256) {
        return ERC20Balance(d.lpToken);
    }

    /// @dev to receive Ether (Matic)
    receive() external payable {}

}
