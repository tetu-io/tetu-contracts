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
contract TradeBot1Inch is ReentrancyGuard {
  using SafeERC20 for IERC20;

  struct Position {
    address owner;
    address executor;
    address tokenIn;
    uint tokenInAmount;
    address tokenOut;
    uint tokenOutAmount;
    uint minPrice;
    uint maxPrice;
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

  address public immutable oneInchRouter;

  constructor(address _oneInchRouter) {
    require(_oneInchRouter != address(0), "WRONG_INPUT");
    oneInchRouter = _oneInchRouter;
  }

  function open(
    address executor,
    address tokenIn,
    uint tokenInAmount,
    address tokenOut,
    uint minPrice,
    uint maxPrice
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
      minPrice,
      maxPrice
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

  function execute(address posOwner, uint amount, bytes memory swapData) external nonReentrant {
    Position memory pos = positions[posOwner];
    require(pos.executor == msg.sender, "Only position executor");
    require(pos.tokenInAmount >= amount, "Amount too high");

    uint tokenInAmount;
    uint tokenOutAmount;

    {
      uint tokenInSnapshotBefore = IERC20(pos.tokenIn).balanceOf(address(this));
      uint tokenOutSnapshotBefore = IERC20(pos.tokenOut).balanceOf(address(this));

      _approveIfNeeds(pos.tokenIn, amount, oneInchRouter);
      (bool success,bytes memory result) = oneInchRouter.call(swapData);
      require(success, string(result));

      uint tokenInSnapshotAfter = IERC20(pos.tokenIn).balanceOf(address(this));
      uint tokenOutSnapshotAfter = IERC20(pos.tokenOut).balanceOf(address(this));

      tokenInAmount = tokenInSnapshotBefore - tokenInSnapshotAfter;
      tokenOutAmount = tokenOutSnapshotAfter - tokenOutSnapshotBefore;

      require(tokenInSnapshotBefore > tokenInSnapshotAfter, "TokenIn unhealthy");
      require(tokenInAmount == amount, "Swap unhealthy");
      require(tokenOutSnapshotAfter > tokenOutSnapshotBefore, "TokenOut unhealthy");
    }

    pos.tokenInAmount = pos.tokenInAmount - tokenInAmount;
    pos.tokenOutAmount = pos.tokenOutAmount + tokenOutAmount;
    positions[posOwner] = pos;

    uint tokenInAmountNormalized = tokenInAmount * 1e18 / (10 ** IERC20Extended(pos.tokenIn).decimals());
    uint tokenOutAmountNormalized = tokenOutAmount * 1e18 / (10 ** IERC20Extended(pos.tokenOut).decimals());
    uint price = tokenInAmountNormalized * 1e18 / tokenOutAmountNormalized;

    require(price < pos.maxPrice, string(abi.encodePacked("price too high ", _toString(price))));
    require(price > pos.minPrice, string(abi.encodePacked("price too low ", _toString(price))));

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

  function tradesLength(address owner) external view returns (uint) {
    return trades[owner].length;
  }

  function _approveIfNeeds(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).safeApprove(spender, 0);
      IERC20(token).safeApprove(spender, type(uint).max);
    }
  }

  /// @dev Inspired by OraclizeAPI's implementation - MIT license
  ///      https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol
  function _toString(uint value) internal pure returns (string memory) {
    if (value == 0) {
      return "0";
    }
    uint temp = value;
    uint digits;
    while (temp != 0) {
      digits++;
      temp /= 10;
    }
    bytes memory buffer = new bytes(digits);
    while (value != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + uint(value % 10)));
      value /= 10;
    }
    return string(buffer);
  }

}
