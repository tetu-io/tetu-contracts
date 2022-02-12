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

import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/IERC20Metadata.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/ReentrancyGuard.sol";
import "../../base/governance/ControllableV2.sol";
import "../../swap/interfaces/ITetuSwapPair.sol";
//import "../../third_party/uniswap/IUniswapV2Factory.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";
import "../../third_party/IERC20Name.sol"; // TODO remove
import "./IMultiSwap2.sol";

import "hardhat/console.sol";

/// @title MultiSwapLoader
/// @dev Multi Swap Data Loader
/// @author bogdoslav
contract MultiSwap2 is IMultiSwap2, ControllableV2,  ReentrancyGuard {
  using SafeERC20 for IERC20;

  string public constant VERSION = "2.0.0";
  uint public constant MAX_AMOUNT = type(uint).max;
  uint128 constant private _PRECISION_FEE = 10000;
  uint128 constant private _PRECISION_SLIPPAGE = 1000;

  constructor(address _controller) {
    initialize(_controller);
  }

  function initialize(address _controller)
  public initializer {
    ControllableV2.initializeControllable(_controller);
  }

  // ******* VIEWS FOR BACKEND TS LIBRARY DATA LOADING ******




  // ******************** USERS ACTIONS *********************

  /// @dev Approval for token is assumed.
  ///      Swap tokenIn to tokenOut using given lp path
  ///      Slippage tolerance is a number from 0 to 1000 that reflect is a 0.1 percent of acceptable slippage
  function multiSwap(
    address tokenIn,
    address tokenOut,
    uint amount,
    uint slippageTolerance,
    bytes memory routesData
  ) external override nonReentrant {
    require(tokenIn != address(0), "MC: zero tokenIn");
    require(tokenOut != address(0), "MC: zero tokenOut");
    require(amount != 0, "MC: zero amount");
    require(slippageTolerance <= _PRECISION_SLIPPAGE, "MC: too high slippage tolerance");
    require(tokenIn != tokenOut, "MC: same in/out");

    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);
    // some tokens have a burn/fee mechanic for transfers so amount can be changed
    // we are recommend to use manual swapping for this kind of tokens
    require(amount <= IERC20(tokenIn).balanceOf(address(this)),
      "MS: transfer fees forbidden for input Token");

    (uint[] memory weights, Step[][] memory routes, uint amountOut) = abi.decode(routesData, (uint[], Step[][], uint));
    require(routes.length > 0, 'MS: empty array');
    require(routes.length == weights.length, 'MS: different arrays lengths');

    console.log('amount =>', amount);
    // calculate amounts for each route based on weights
    uint[] memory weightedAmounts = new uint[](weights.length);
    uint amountDistributed = 0;
    uint lastWeightIndex = weights.length - 1;
    for (uint w = 0; w < lastWeightIndex; w++) { // weights
      uint partialAmount = amount * weights[w] / 100;
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
        _doSwapStepUniswap2(route[s], s == 0 ? weightedAmounts[r] : MAX_AMOUNT);
      }
    }

    uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
    console.log('=> tokenOutBalance', tokenOutBalance);

    require(tokenOutBalance != 0, "MS: zero token out amount");
    uint minAmountOut = amountOut - (amountOut * slippageTolerance / _PRECISION_SLIPPAGE);
    console.log('--    minAmountOut', minAmountOut);
    require(tokenOutBalance >= minAmountOut, "MS: amount out less than required");
    IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);
    // some tokens have a burn/fee mechanic for transfers so amount can be changed
    // we are recommend to use manual swapping for this kind of tokens
    require(tokenOutBalance <= IERC20(tokenOut).balanceOf(msg.sender),
      "MS: transfer fees forbidden for output Token");
  }

  // ******************* INTERNAL ***************************

  function _doSwapStepUniswap2(Step memory step, uint amountIn)
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
    (uint amountOut0, uint amountOut1) = _getAmountsOut(pair, amountIn, step.reverse);
    console.log('amountOut0, amountOut1', amountOut0, amountOut1);
    pair.swap(amountOut0, amountOut1, address(this), emptyData);
  }

  function _getAmountsOut(IUniswapV2Pair pair, uint amountIn, bool reverse)
  internal view returns(uint amountOut0, uint amountOut1) {
    (amountOut0, amountOut1) = (0, 0);
    uint fee = _getTetuSwapFee(address(pair));
    (uint112 reserve0, uint112 reserve1,) = pair.getReserves();

    if (reverse) {
      amountOut0 = _getAmountOut(amountIn, reserve1, reserve0, fee);
    } else {
      amountOut1 = _getAmountOut(amountIn, reserve0, reserve1, fee);
    }
  }

  /// @dev given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
  function _getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, uint fee) internal view returns (uint amountOut) {
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
  function _getTetuSwapFee(address pair) internal view returns(uint) {
    try ITetuSwapPair(pair).fee() returns (uint fee) {
      return fee;
    } catch Error(string memory /*reason*/) {
    } catch (bytes memory /*lowLevelData*/) {
    }
    return 30;
  }

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint _amount) external {
    require(_isGovernance(msg.sender) || _isController(msg.sender), "MS: forbidden");
    IERC20(_token).safeTransfer(msg.sender, _amount);
  }

}
