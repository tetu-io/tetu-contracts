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

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../../base/governance/Controllable.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/Math.sol";
import "../../third_party/IERC20Extended.sol";

/// @title LiquidityBalancer sells a portion of the available amount of
///        TETU Tokens when the price hits the target price and immediately
///        adds equilibrated amount of both tokens to liquidity.
///        After each sale the target price increases.
/// @author belbix
contract LiquidityBalancer is Controllable {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  string public constant VERSION = "1.1.0";
  uint256 constant internal PRECISION = 10 ** 18;
  uint256 public targetPriceUpdateNumerator = 100; // 0.1 % by default
  uint256 public targetTvlUpdateNumerator = 100; // 0.1 % by default
  uint256 public removeLiqRatioNumerator = 100; // 0.1 % by default
  uint256 constant public DENOMINATOR = 100000;

  mapping(address => uint256) public priceTargets;
  mapping(address => uint256) public lpTvlTargets;
  mapping(address => address) public routers;
  address[] internal route;

  event PriceTargetChanged(address token, uint256 target);
  event LpTvlTargetChanged(address lp, uint256 target);
  event RouterChanged(address lp, address router);
  event PriceNumeratorChanged(uint256 value);
  event TvlNumeratorChanged(uint256 value);
  event RemLiqNumeratorChanged(uint256 value);
  event Swap(address tokenIn, address tokenOut, uint256 amount);
  event LiqAdded(address lp, uint256 amount0, uint256 amount1);
  event LiqRemoved(address lp, uint256 amount);
  event TokenMoved(address token, uint256 amount);

  constructor(address _controller) {
    Controllable.initializeControllable(_controller);
  }

  modifier onlyHardWorkerOrController() {
    require(IController(controller()).isHardWorker(msg.sender)
      || controller() == msg.sender, "LB: Only hardworker or controller");
    _;
  }

  function changeLiquidity(address _token, address _lp) external onlyHardWorkerOrController {
    require(priceTargets[_token] != 0, "LB: Zero price target");
    require(lpTvlTargets[_lp] != 0, "LB: Zero lp tvl target");

    IUniswapV2Pair pair = IUniswapV2Pair(_lp);
    address oppositeToken = (_token == pair.token0()) ? pair.token1() : pair.token0();

    uint256 sellAmount = needToSell(_token, _lp);
    uint256 remAmount = needToRemove(_token, _lp);

    if (remAmount > 0) {
      removeLiquidity(_lp, remAmount);
      // buy target tokens
      route.push(oppositeToken);
      route.push(_token);
      swap(
        routers[_lp],
        route,
        IERC20(oppositeToken).balanceOf(address(this))
      );
      // update target price for avoid a tons of rebalancing cycles
      // also it means that we hit our global goal - price and TVL balanced
      (,, uint256 price,) = getLpInfo(_lp, _token);
      priceTargets[_token] = price;
      route.pop();
      route.pop();
      updateLpTvlTarget(_lp);
    } else if (sellAmount > 0) {
      // sell target token for opposite token
      route.push(_token);
      route.push(oppositeToken);
      swap(
        routers[_lp],
        route,
        sellAmount
      );
      route.pop();
      route.pop();
      addLiquidity(_lp);
      updatePriceTarget(_token);
    }
  }

  function needToSell(address _token, address _lp) public view returns (uint256) {
    uint256 tokenBalance = IERC20(_token).balanceOf(address(this));
    (, uint256 oppositeReserve, uint256 price, uint256 tokenReserve) = getLpInfo(_lp, _token);

    uint256 sellAmount = computeSellAmount(tokenReserve, oppositeReserve, priceTargets[_token]);

    uint256 sellCap = 0;
    // not enough money
    if (tokenBalance > sellAmount) {
      uint256 needForAddingLiq = computeOutputAmount(tokenReserve, oppositeReserve, sellAmount)
      .mul(PRECISION).div(priceTargets[_token]);
      uint256 balAfterSwap = tokenBalance.sub(sellAmount);
      // after the sell we will not have enough money for adding the liquidity
      // don't sell in this case
      // need to create an accurate amount computation
      if (balAfterSwap > needForAddingLiq) {
        sellCap = balAfterSwap.sub(needForAddingLiq);
      }
    }

    // after swap you should have amount for adding liquidity
    sellAmount = Math.min(sellAmount, sellCap);

    if (sellAmount > 0 && price > priceTargets[_token]) {
      // don't sell more than a half for adding a liquidity after sell
      return Math.min(sellAmount, sellCap);
    } else {
      return 0;
    }
  }

  function needToRemove(address _token, address _lp) public view returns (uint256) {
    uint256 lpBalance = IERC20(_lp).balanceOf(address(this));
    (, uint256 oppositeTokenStacked, ,) = getLpInfo(_lp, _token);
    uint256 currentTvl = oppositeTokenStacked.mul(2);

    uint256 remAmount = computeRemAmount(currentTvl, _lp);
    remAmount = Math.min(remAmount, lpBalance);

    if (remAmount > 0 && lpBalance >= remAmount && currentTvl > lpTvlTargets[_lp]) {
      uint256 result = Math.min(remAmount, lpBalance);
      result = result.mul(removeLiqRatioNumerator).div(DENOMINATOR);
      return result;
    } else {
      return 0;
    }
  }

  function computeSellAmount(
    uint256 tokenReserve,
    uint256 oppositeReserve,
    uint256 targetPrice
  ) public pure returns (uint256) {
    if (targetPrice == 0) {
      return 0;
    }
    // ignore fees
    uint base = oppositeReserve.mul(tokenReserve).div(targetPrice).mul(PRECISION);
    uint256 sqrtBase = sqrt(base);
    if (sqrtBase < tokenReserve) {
      // in this case the price lower than target price, need to sell
      return 0;
    }
    return sqrtBase.sub(tokenReserve);
  }

  function computeOutputAmount(
    uint256 tokenReserve,
    uint256 oppositeReserve,
    uint256 inputAmount
  ) public pure returns (uint256){
    if (tokenReserve == 0 && inputAmount == 0) {
      return 0;
    }
    return inputAmount.mul(oppositeReserve).div(tokenReserve.add(inputAmount));
  }

  function computeRemAmount(uint256 currentTvl, address _lp) internal view returns (uint256) {
    if (currentTvl == 0 || currentTvl < lpTvlTargets[_lp]) {
      // no remove require
      return 0;
    }
    uint256 remAmountRate = currentTvl.sub(lpTvlTargets[_lp]).mul(PRECISION).div(currentTvl);
    return IERC20(address(_lp)).totalSupply().mul(remAmountRate).div(PRECISION);
  }

  function updateLpTvlTarget(address _lp) internal {
    lpTvlTargets[_lp] = lpTvlTargets[_lp].add(
      lpTvlTargets[_lp].mul(targetTvlUpdateNumerator).div(DENOMINATOR)
    );
  }

  function updatePriceTarget(address _token) internal {
    priceTargets[_token] = priceTargets[_token].add(
      priceTargets[_token].mul(targetPriceUpdateNumerator).div(DENOMINATOR)
    );
  }

  // https://uniswap.org/docs/v2/smart-contracts/router02/#swapexacttokensfortokens
  function swap(address _router, address[] memory _route, uint256 _amount) internal {
    require(_router != address(0), "LB: Zero router");
    uint256 bal = IERC20(_route[0]).balanceOf(address(this));
    require(bal >= _amount, "LB: Not enough balance");
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
    emit Swap(_route[0], _route[1], _amount);
  }

  function addLiquidity(address _lp) internal {
    address token0 = IUniswapV2Pair(_lp).token0();
    address token1 = IUniswapV2Pair(_lp).token1();
    address routerAddress = routers[_lp];
    require(routerAddress != address(0), "LB: Router not found");
    IUniswapV2Router02 router = IUniswapV2Router02(routerAddress);

    uint256 amount0 = IERC20(token0).balanceOf(address(this));
    uint256 amount1 = IERC20(token1).balanceOf(address(this));

    IERC20(token0).safeApprove(routerAddress, 0);
    IERC20(token0).safeApprove(routerAddress, amount0);
    IERC20(token1).safeApprove(routerAddress, 0);
    IERC20(token1).safeApprove(routerAddress, amount1);
    //slither-disable-next-line unused-return
    router.addLiquidity(
      token0,
      token1,
      amount0,
      amount1,
      1,
      1,
      address(this),
      block.timestamp
    );
    emit LiqAdded(_lp, amount0, amount1);
  }

  function removeLiquidity(address _lp, uint256 _amount) internal {
    address token0 = IUniswapV2Pair(_lp).token0();
    address token1 = IUniswapV2Pair(_lp).token1();
    uint256 bal = IERC20(_lp).balanceOf(address(this));
    require(bal >= _amount, "LB: Not enough balance");
    address routerAddress = routers[_lp];
    require(routerAddress != address(0), "LB: Router not found");
    IUniswapV2Router02 router = IUniswapV2Router02(routerAddress);

    IERC20(_lp).safeApprove(routerAddress, 0);
    IERC20(_lp).safeApprove(routerAddress, _amount);
    //slither-disable-next-line unused-return
    router.removeLiquidity(
      token0,
      token1,
      _amount,
      1,
      1,
      address(this),
      block.timestamp
    );

    emit LiqRemoved(_lp, _amount);
  }

  function getLpInfo(address pairAddress, address targetToken)
  internal view returns (address oppositeToken, uint256 oppositeTokenStacked, uint256 price, uint256 tokenStacked) {
    IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
    address token0 = pair.token0();
    address token1 = pair.token1();
    uint256 token0Decimals = IERC20Extended(token0).decimals();
    uint256 token1Decimals = IERC20Extended(token1).decimals();

    (uint256 reserve0, uint256 reserve1,) = pair.getReserves();

    // both reserves should have the same decimals
    reserve0 = reserve0.mul(PRECISION).div(10 ** token0Decimals);
    reserve1 = reserve1.mul(PRECISION).div(10 ** token1Decimals);

    tokenStacked = (targetToken == token0) ? reserve0 : reserve1;
    oppositeTokenStacked = (targetToken == token0) ? reserve1 : reserve0;
    oppositeToken = (targetToken == token0) ? token1 : token0;

    if (targetToken == token0) {
      price = reserve1
      .mul(PRECISION)
      .div(reserve0);
    } else {
      price = reserve0
      .mul(PRECISION)
      .div(reserve1);
    }
    return (oppositeToken, oppositeTokenStacked, price, tokenStacked);
  }

  // uniswap square root implementation
  // babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
  function sqrt(uint256 y) internal pure returns (uint256 z) {
    if (y <= 0) {
      return 0;
    }
    if (y > 3) {
      z = y;
      uint256 x = y.div(2).add(1);
      while (x < z) {
        z = x;
        x = y.div(x).add(x).div(2);
      }
    } else if (y != 0) {
      z = 1;
    }
    return z;
  }

  // ***************** GOVERNANCE ACTIONS *********************

  function moveLiquidity(address from, address to) external onlyControllerOrGovernance {
    IUniswapV2Pair sourceLp = IUniswapV2Pair(from);
    IUniswapV2Pair targetLp = IUniswapV2Pair(to);
    address token0 = sourceLp.token0();
    address token1 = sourceLp.token1();
    require(token0 == targetLp.token0() && token1 == targetLp.token1(), "LB: Wrong tokens in lps");

    removeLiquidity(from, IERC20(from).balanceOf(address(this)));
    addLiquidity(to);
  }

  // move tokens to controller where money will be protected with time lock
  function moveTokensToController(address _token, uint256 amount) external onlyControllerOrGovernance {
    uint256 tokenBalance = IERC20(_token).balanceOf(address(this));
    require(tokenBalance >= amount, "LB: Not enough balance");
    IERC20(_token).safeTransfer(controller(), amount);
    emit TokenMoved(_token, amount);
  }

  // should have PRECISION_DECIMALS
  function setTargetPrice(address _token, uint256 _target) external onlyControllerOrGovernance {
    require(_target != 0, "LB: Wrong target");
    require(_token != address(0), "LB: Wrong token");
    priceTargets[_token] = _target;
    emit PriceTargetChanged(_token, _target);
  }

  // should have PRECISION_DECIMALS
  function setTargetLpTvl(address _lp, uint256 _target) external onlyControllerOrGovernance {
    require(_target != 0, "LB: Wrong target");
    require(_lp != address(0), "LB: Wrong lp");
    lpTvlTargets[_lp] = _target;
    emit LpTvlTargetChanged(_lp, _target);
  }

  function setRouter(address _lp, address _router) external onlyControllerOrGovernance {
    require(_lp != address(0), "LB: Wrong lp");
    require(_router != address(0), "LB: Wrong router");
    routers[_lp] = _router;
    emit RouterChanged(_lp, _router);
  }

  function setTargetPriceUpdateNumerator(uint256 _numerator) external onlyControllerOrGovernance {
    require(_numerator > 0, "LB: Zero not allowed");
    require(_numerator < DENOMINATOR, "LB: Should be lower than denominator");
    targetPriceUpdateNumerator = _numerator;
    emit PriceNumeratorChanged(_numerator);
  }

  function setTargetTvlUpdateNumerator(uint256 _numerator) external onlyControllerOrGovernance {
    require(_numerator > 0, "LB: Zero not allowed");
    require(_numerator < DENOMINATOR, "LB: Should be lower than denominator");
    targetTvlUpdateNumerator = _numerator;
    emit TvlNumeratorChanged(_numerator);
  }

  function setRemoveLiqRatioNumerator(uint256 _numerator) external onlyControllerOrGovernance {
    require(_numerator > 0, "LB: Zero not allowed");
    require(_numerator <= DENOMINATOR, "LB: Should be lower or equal than denominator");
    removeLiqRatioNumerator = _numerator;
    emit RemLiqNumeratorChanged(_numerator);
  }

}
