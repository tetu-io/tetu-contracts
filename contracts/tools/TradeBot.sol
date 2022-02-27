// SPDX-License-Identifier: ISC
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/

pragma solidity 0.8.4;

import "../third_party/uniswap/IUniswapV2Router02.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../openzeppelin/Math.sol";

import "hardhat/console.sol";

/// @title Simple contract for safe swap from untrusted EOA
/// @author belbix
contract TradeBot is ReentrancyGuard {
  using SafeERC20 for IERC20;

  struct Position {
    address owner;
    address executor;
    address tokenIn;
    uint tokenInAmount;
    address tokenOut;
    uint tokenOutAmount;
    address router;
  }

  string public constant VERSION = "1.0.0";

  mapping(address => Position) public positions;

  function open(
    address executor,
    address tokenIn,
    uint tokenInAmount,
    address tokenOut,
    address router
  ) external nonReentrant {
    require(positions[msg.sender].owner == address(0), "Position already opened");

    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

    positions[msg.sender] = Position(
      msg.sender,
      executor,
      tokenIn,
      tokenInAmount,
      tokenOut,
      0,
      router
    );
  }

  function close() external nonReentrant {
    Position memory pos = positions[msg.sender];
    require(pos.owner == msg.sender, "Only position owner");

    console.log("pos.tokenInAmount", pos.tokenInAmount);
    console.log("IERC20(pos.tokenIn).balanceOf(address(this))", IERC20(pos.tokenIn).balanceOf(address(this)));
    if (pos.tokenInAmount != 0) {
      // in case of little fluctuation by the reason of rounding
      uint amountIn = Math.min(pos.tokenInAmount, IERC20(pos.tokenIn).balanceOf(address(this)));
      require(amountIn != 0, "Zero amount in");
      IERC20(pos.tokenIn).safeTransfer(msg.sender, amountIn);
    }

    console.log("pos.tokenOutAmount", pos.tokenOutAmount);
    console.log("IERC20(pos.tokenOut).balanceOf(address(this))", IERC20(pos.tokenOut).balanceOf(address(this)));
    if (pos.tokenOutAmount != 0) {
      // avoiding rounding errors
      uint amountOut = Math.min(pos.tokenOutAmount, IERC20(pos.tokenOut).balanceOf(address(this)));
      require(amountOut != 0, "Zero amount out");
      IERC20(pos.tokenOut).safeTransfer(msg.sender, amountOut);
    }

    delete positions[msg.sender];
  }

  function execute(address posOwner, uint amount) external nonReentrant {
    Position memory pos = positions[posOwner];
    require(pos.executor == msg.sender, "Only position executor");
    require(pos.tokenInAmount >= amount, "Amount too high");

    uint tokenInSnapshotBefore = IERC20(pos.tokenIn).balanceOf(address(this));
    uint tokenOutSnapshotBefore = IERC20(pos.tokenOut).balanceOf(address(this));
    console.log("pos.tokenInAmount", pos.tokenInAmount);
    console.log("tokenInSnapshotBefore", tokenInSnapshotBefore);
    console.log("tokenOutSnapshotBefore", tokenOutSnapshotBefore);

    address[] memory path = new address[](2);
    path[0] = pos.tokenIn;
    path[1] = pos.tokenOut;
    swap(pos.router, path, amount);

    uint tokenInSnapshotAfter = IERC20(pos.tokenIn).balanceOf(address(this));
    uint tokenOutSnapshotAfter = IERC20(pos.tokenOut).balanceOf(address(this));
    console.log("tokenInSnapshotAfter", tokenInSnapshotAfter);
    console.log("tokenOutSnapshotAfter", tokenOutSnapshotAfter);

    require(tokenInSnapshotBefore > tokenInSnapshotAfter, "TokenIn unhealthy");
    require(tokenInSnapshotBefore - tokenInSnapshotAfter == amount, "Swap unhealthy");
    require(tokenOutSnapshotAfter > tokenOutSnapshotBefore, "TokenOut unhealthy");

    pos.tokenInAmount = pos.tokenInAmount - (tokenInSnapshotBefore - tokenInSnapshotAfter);
    pos.tokenOutAmount = pos.tokenOutAmount + (tokenOutSnapshotAfter - tokenOutSnapshotBefore);
    positions[posOwner] = pos;
  }

  // https://uniswap.org/docs/v2/smart-contracts/router02/#swapexacttokensfortokens
  function swap(address _router, address[] memory _route, uint256 _amount) internal {
    require(_router != address(0), "Zero router");
    uint256 bal = IERC20(_route[0]).balanceOf(address(this));
    require(bal >= _amount, "Not enough balance");
    IERC20(_route[0]).safeApprove(_router, 0);
    IERC20(_route[0]).safeApprove(_router, _amount);
    //slither-disable-next-line unused-return
    IUniswapV2Router02(_router).swapExactTokensForTokens(
      _amount,
      0,
      _route,
      address(this),
      block.timestamp
    );
  }

}
