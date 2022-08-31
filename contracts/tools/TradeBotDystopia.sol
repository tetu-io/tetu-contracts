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

import "../third_party/dystopia/IDystopiaRouter.sol";
import "../third_party/dystopia/IDystopiaPair.sol";
import "../third_party/dystopia/IDystopiaFactory.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../openzeppelin/Math.sol";
import "../third_party/IERC20Extended.sol";

/// @title Simple contract for safe swap from untrusted EOA
/// @author belbix
contract TradeBotDystopia is ReentrancyGuard {
  using SafeERC20 for IERC20;

  struct Position {
    address owner;
    address executor;
    address tokenIn;
    uint tokenInAmount;
    address tokenOut;
    uint tokenOutAmount;
    bool stable;
    address router;
  }

  struct Trade {
    Position position;
    uint tradeTime;
    uint tradeBlock;
    uint tokenInAmount;
    uint tokenOutAmount;
    uint price;
  }

  string public constant VERSION = "1.0.0";

  mapping(address => Position) public positions;
  mapping(address => Trade[]) public trades;

  function open(
    address executor,
    address tokenIn,
    uint tokenInAmount,
    address tokenOut,
    bool stable,
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
      stable,
      router
    );
  }

  function close() external nonReentrant {
    Position memory pos = positions[msg.sender];
    require(pos.owner == msg.sender, "Only position owner");

    if (pos.tokenInAmount != 0) {
      // in case of little fluctuation by the reason of rounding
      uint amountIn = Math.min(pos.tokenInAmount, IERC20(pos.tokenIn).balanceOf(address(this)));
      require(amountIn != 0, "Zero amount in");
      IERC20(pos.tokenIn).safeTransfer(msg.sender, amountIn);
    }

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

    IDystopiaRouter.Route[] memory route = new IDystopiaRouter.Route[](1);
    route[0] = IDystopiaRouter.Route(
      pos.tokenIn,
      pos.tokenOut,
      pos.stable
    );
    swap(pos.router, route, amount);

    uint tokenInSnapshotAfter = IERC20(pos.tokenIn).balanceOf(address(this));
    uint tokenOutSnapshotAfter = IERC20(pos.tokenOut).balanceOf(address(this));

    require(tokenInSnapshotBefore > tokenInSnapshotAfter, "TokenIn unhealthy");
    require(tokenInSnapshotBefore - tokenInSnapshotAfter == amount, "Swap unhealthy");
    require(tokenOutSnapshotAfter > tokenOutSnapshotBefore, "TokenOut unhealthy");

    pos.tokenInAmount = pos.tokenInAmount - (tokenInSnapshotBefore - tokenInSnapshotAfter);
    pos.tokenOutAmount = pos.tokenOutAmount + (tokenOutSnapshotAfter - tokenOutSnapshotBefore);
    positions[posOwner] = pos;

    uint tokenInAmount = tokenInSnapshotBefore - tokenInSnapshotAfter;
    uint tokenOutAmount = tokenOutSnapshotAfter - tokenOutSnapshotBefore;

    address pair = IDystopiaFactory(IDystopiaRouter(pos.router).factory()).getPair(pos.tokenIn, pos.tokenOut, pos.stable);
    (,, uint price,) = getLpInfo(pair, pos.tokenOut);
    trades[posOwner].push(Trade(
        pos,
        block.timestamp,
        block.number,
        tokenInAmount,
        tokenOutAmount,
        price
      ));
  }

  function swap(address _router, IDystopiaRouter.Route[] memory _route, uint256 _amount) internal {
    require(_router != address(0), "Zero router");
    uint256 bal = IERC20(_route[0].from).balanceOf(address(this));
    require(bal >= _amount, "Not enough balance");
    IERC20(_route[0].from).safeApprove(_router, 0);
    IERC20(_route[0].from).safeApprove(_router, _amount);
    //slither-disable-next-line unused-return
    IDystopiaRouter(_router).swapExactTokensForTokens(
      _amount,
      0,
      _route,
      address(this),
      block.timestamp
    );
  }

  function getLpInfo(address pairAddress, address targetToken)
  internal view returns (address oppositeToken, uint256 oppositeTokenStacked, uint256 price, uint256 tokenStacked) {
    IDystopiaPair pair = IDystopiaPair(pairAddress);
    address token0 = pair.token0();
    address token1 = pair.token1();
    uint256 token0Decimals = IERC20Extended(token0).decimals();
    uint256 token1Decimals = IERC20Extended(token1).decimals();

    (uint256 reserve0, uint256 reserve1,) = pair.getReserves();

    // both reserves should have the same decimals
    reserve0 = reserve0 * 1e18 / (10 ** token0Decimals);
    reserve1 = reserve1 * 1e18 / (10 ** token1Decimals);

    tokenStacked = (targetToken == token0) ? reserve0 : reserve1;
    oppositeTokenStacked = (targetToken == token0) ? reserve1 : reserve0;
    oppositeToken = (targetToken == token0) ? token1 : token0;

    if (targetToken == token0) {
      price = reserve1 * 1e18 / reserve0;
    } else {
      price = reserve0 * 1e18 / reserve1;
    }

    price = getPrice(pair, targetToken);
    return (oppositeToken, oppositeTokenStacked, price, tokenStacked);
  }

  function getPrice(IDystopiaPair pair, address targetToken) public view returns (uint) {
    address token0 = pair.token0();
    address token1 = pair.token1();
    uint256 token0Decimals = IERC20Extended(token0).decimals();
    uint256 token1Decimals = IERC20Extended(token1).decimals();

    uint256 tokenADecimals = token0 == targetToken ? token0Decimals : token1Decimals;
    uint256 tokenBDecimals = token0 == targetToken ? token1Decimals : token0Decimals;

    return pair.getAmountOut(10 ** tokenADecimals, targetToken) * 1e18 / 10 ** tokenBDecimals;
  }

  function tradesLength(address owner) external view returns (uint) {
    return trades[owner].length;
  }

}
