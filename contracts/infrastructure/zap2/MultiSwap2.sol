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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol"; // TODO remove
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../../base/governance/Controllable.sol";
import "../../swap/interfaces/ITetuSwapPair.sol";
import "../../third_party/uniswap/IUniswapV2Factory.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";
import "../../third_party/IERC20Name.sol";
import "../../swap/libraries/Math.sol";
import "./IMultiSwap2.sol";

import "hardhat/console.sol"; // TODO remove

/// @title MultiSwapLoader
/// @dev Multi Swap Data Loader
/// @author bogdoslav
contract MultiSwap2 is Controllable, IMultiSwap2, ReentrancyGuard  {
  using SafeERC20 for IERC20;

  string public constant VERSION = "2.0.0";
  uint256 public constant MAX_AMOUNT = type(uint).max;
  uint128 constant private _PRECISION_FEE = 10000;


  mapping(address => address) public factoryToRouter;

  struct LpData {
    address lp;
    address token0;
    address token1;
  }

  struct ReservesData {
    uint256 reserve0;
    uint256 reserve1;
  }

  struct TokenData {
    address token;
    string symbol;
  }


  constructor(
    address _controller,
    address[] memory _factories,
    address[] memory _routers
) {
  Controllable.initializeControllable(_controller);
  for (uint256 i = 0; i < _factories.length; i++) {
    factoryToRouter[_factories[i]] = _routers[i];
  }
}
  // ******************* VIEWS *****************************

  function routerForPair(address pair) public override view returns (address) { // TODO split to internal and external
    return factoryToRouter[IUniswapV2Pair(pair).factory()];
  }


  // ******* VIEWS FOR BACKEND TS LIBRARY DATA LOADING ******

  function loadPairsUniswapV2(address factoryAddress, uint256 skip, uint256 count )
  external view returns (LpData[] memory pairs) {
    console.log('loadPairsUniswapV2');
    IUniswapV2Factory factory = IUniswapV2Factory(factoryAddress);
    uint256 allPairsLength = factory.allPairsLength();
    uint256 maxPair = Math.min(allPairsLength, skip + count);
    pairs = new LpData[](maxPair - skip);

    uint256 b = 0;
    for (uint p = skip; p < maxPair; p++) {
      address pairAddress = factory.allPairs(p);
      console.log('pairAddress', pairAddress);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      address token0 = pair.token0();
      address token1 = pair.token1();

      pairs[b++] = LpData({lp:pairAddress, token0:token0, token1: token1});
    }
  }

  function loadPairReserves(address[] memory pairs)
  external view returns (ReservesData[] memory data) {
    uint256 len = pairs.length;
    data = new ReservesData[](len);

    for (uint i = 0; i < len; i++) {
      address pairAddress = pairs[i];
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      try pair.getReserves() returns (uint112 reserve0, uint112 reserve1, uint32) {
        data[i] = ReservesData({reserve0:reserve0, reserve1:reserve1});
      } catch (bytes memory) { // any error interpret as nil reserves
        data[i] = ReservesData({reserve0:0, reserve1:0});
      }
    }
  }

  function loadTokenNames(address[] memory tokens)
  external view returns (TokenData[] memory data) {
    uint256 len = tokens.length;
    data = new TokenData[](len);

    for (uint i = 0; i < len; i++) {
      address tokenAddress = tokens[i];
      IERC20Name tokenName = IERC20Name(tokenAddress);
      string memory symbol = tokenName.symbol();
      data[i] = TokenData({token:tokenAddress, symbol: symbol});
    }
  }

  // ******************** USERS ACTIONS *********************

  /// @dev Approval for token is assumed.
  ///      Swap tokenIn to tokenOut using given lp path
  ///      Slippage tolerance is a number from 0 to 100 that reflect is a percent of acceptable slippage
  function multiSwap(
    address tokenIn,
    address tokenOut,
    uint256 amount,
    uint256 slippageTolerance,
    bytes memory routesData
  ) external override nonReentrant {
    require(tokenIn != address(0), "MC: zero tokenIn");
    require(tokenOut != address(0), "MC: zero tokenOut");
    require(amount != 0, "MC: zero amount");
    require(slippageTolerance <= 100, "MC: too high slippage tolerance");
    require(tokenIn != tokenOut, "MC: same in/out");

    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);
    // some tokens have a burn/fee mechanic for transfers so amount can be changed
    // we are recommend to use manual swapping for this kind of tokens
    require(amount <= IERC20(tokenIn).balanceOf(address(this)),
      "MS: transfer fees forbidden for input Token");

    (uint[] memory weights, Step[][] memory routes) = abi.decode(routesData, (uint[], Step[][]));
    require(routes.length > 0, 'MS: empty array');
    require(routes.length == weights.length, 'MS: different arrays lengths');

    console.log('amount =>', amount);
    // calculate amounts for each route based on weights
    uint[] memory weightedAmounts = new uint[](weights.length);
    uint256 amountDistributed = 0;
    uint256 lastWeightIndex = weights.length - 1;
    for (uint w = 0; w < lastWeightIndex; w++) { // weights
      uint256 partialAmount = amount * weights[w] / 100;
      weightedAmounts[w] = partialAmount;
      amountDistributed += partialAmount;
      console.log('partial, distributed amounts', partialAmount, amountDistributed);
    }
    // set last route weight separately, to avoid rounding errors
    weightedAmounts[lastWeightIndex] = amount - amountDistributed;

    // swap routes
    for (uint r = 0; r < routes.length; r++) { // routes
      console.log('******************');
      console.log('weight', r, weights[r], weightedAmounts[r]);
      Step[] memory route = routes[r];
      for (uint s = 0; s < route.length; s++) { // steps
        // swap weightedAmount for initial step and MAX_AMOUNT for next steps
        doSwapStepUniswap2(route[s], s == 0 ? weightedAmounts[r] : MAX_AMOUNT);
      }
    }

    uint256 tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
    console.log('=> tokenOutBalance', tokenOutBalance);

    require(tokenOutBalance != 0, "MS: zero token out amount");
    IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);
    // some tokens have a burn/fee mechanic for transfers so amount can be changed
    // we are recommend to use manual swapping for this kind of tokens
    require(tokenOutBalance <= IERC20(tokenOut).balanceOf(msg.sender),
      "MS: transfer fees forbidden for output Token");
  }


  // ******************* INTERNAL ***************************

  function doSwapStepUniswap2(Step memory step, uint256 amountIn)
  internal {
    IUniswapV2Pair pair = IUniswapV2Pair(step.lp);
    console.log(' ');
    if (amountIn == MAX_AMOUNT)
      console.log('swap', step.lp, step.reverse, 'MAX');
    else
      console.log('swap', step.lp, step.reverse, amountIn);

    address tokenIn  =  step.reverse ? pair.token1() : pair.token0();
    address tokenOut =  step.reverse ? pair.token0() : pair.token1();

    console.log(
      IERC20Metadata(tokenIn).symbol(),  IERC20(tokenIn).balanceOf(address(this)),
      IERC20Metadata(tokenOut).symbol(), IERC20(tokenOut).balanceOf(address(this)));

    amountIn = amountIn == MAX_AMOUNT ? IERC20(tokenIn).balanceOf(address(this)) : amountIn;
    IERC20(tokenIn).safeTransfer(address(pair), amountIn);

    bytes memory emptyData;
    (uint256 amountOut0, uint256 amountOut1) = getAmountsOut(pair, amountIn, step.reverse);
    console.log('amountOut0, amountOut1', amountOut0, amountOut1);
    pair.swap(amountOut0, amountOut1, address(this), emptyData);
  }

  function getAmountsOut(IUniswapV2Pair pair, uint amountIn, bool reverse)
  internal view returns(uint amountOut0, uint amountOut1) {
    (amountOut0, amountOut1) = (0, 0);
    uint256 fee = getTetuSwapFee(address(pair));
    (uint112 reserve0, uint112 reserve1,) = pair.getReserves();

    if (reverse) {
      amountOut0 = getAmountOut(amountIn, reserve1, reserve0, fee);
    } else {
      amountOut1 = getAmountOut(amountIn, reserve0, reserve1, fee);
    }
  }

  /// @dev given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
  function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, uint fee) internal view returns (uint amountOut) {
    console.log('getAmountOut amountIn', amountIn);
    console.log('reserveIn, reserveOut, fee', reserveIn, reserveOut, fee);
    require(amountIn > 0, "MS: INSUFFICIENT_INPUT_AMOUNT");
    require(reserveIn > 0 && reserveOut > 0, "MS: INSUFFICIENT_LIQUIDITY");
    uint amountInWithFee = amountIn * (_PRECISION_FEE - fee);
    uint numerator = amountInWithFee * reserveOut;
    uint denominator = reserveIn * _PRECISION_FEE + amountInWithFee;
    amountOut = numerator / denominator;
  }

  /// @dev returns fee for tetuswap or default uniswap v2 fee for other swaps
  function getTetuSwapFee(address pair) internal view returns(uint) {
    try ITetuSwapPair(pair).fee() returns (uint fee) {
      return fee;
    } catch Error(string memory /*reason*/) {
    } catch (bytes memory /*lowLevelData*/) {
    }
    return 30;
  }

/*  /// @dev https://uniswap.org/docs/v2/smart-contracts/router02/#swapexacttokensfortokens
  /// @param _router Uniswap router address
  /// @param _route Path for swap
  /// @param _amount Amount for swap
  /// @return Amounts after the swap
  function swap(
    address _router,
    address[] memory _route,
    uint256 _amount,
    uint256 amountOutMin
  )
  internal returns (uint256[] memory){
    require(_amount <= IERC20(_route[0]).balanceOf(address(this)), "MS: not enough balance for swap");
    IERC20(_route[0]).safeApprove(_router, 0);
    IERC20(_route[0]).safeApprove(_router, _amount);
    return IUniswapV2Router02(_router).swapExactTokensForTokens(
      _amount,
      amountOutMin,
      _route,
      address(this),
      block.timestamp
    );
  }*/

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint256 _amount) external onlyControllerOrGovernance {
    IERC20(_token).safeTransfer(msg.sender, _amount);
  }

}
