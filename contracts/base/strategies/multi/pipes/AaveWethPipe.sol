// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

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
    using SafeMath for uint256;

    /// @dev creates context
    function create(AaveWethPipeData memory d) public pure returns (bytes memory){
        return abi.encode(d.wethGateway, d.pool, d.lpToken);
    }

    /// @dev decodes context
    function context(bytes memory c) internal pure returns (address wethGateway, address pool, address lpToken) {
        (wethGateway, pool, lpToken) = abi.decode(c, (address, address, address));
    }

    /// @dev function for investing, deposits, entering, borrowing
    function put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address wethGateway, address pool, address lpToken) = context(c);
        uint256 before = IERC20(lpToken).balanceOf(address(this));

        IWETHGateway(wethGateway).depositETH{value:amount}(pool, address(this), 0);

        uint256 current = IERC20(lpToken).balanceOf(address(this));
        output = current.sub(before);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    function get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address wethGateway, address pool, address lpToken) = context(c);
        IERC20(lpToken).safeApprove(address(wethGateway), 0);
        IERC20(lpToken).safeApprove(address(wethGateway), amount);
        uint256 before = address(this).balance;

        IWETHGateway(wethGateway).withdrawETH(pool, amount, address(this));

        output = address(this).balance - before;
    }

}
