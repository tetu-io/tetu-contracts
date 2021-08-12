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
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../base/governance/Controllable.sol";
import "../third_party/uniswap/IUniswapV2Pair.sol";
import "../third_party/uniswap/IUniswapV2Router02.sol";
import "./IPriceCalculator.sol";
import "./IMultiSwap.sol";

/// @title Contract for complex swaps across multiple platforms
/// @author belbix
contract MultiSwap is Controllable, IMultiSwap {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  string public constant VERSION = "1.0.0";
  uint256 constant public MAX_ROUTES = 10;

  mapping(address => address) public factoryToRouter;

  /// @dev PriceCalculator contract for determinate the best liquidity pool across swap platforms
  IPriceCalculator public calculator;

  event CalculatorUpdated(address oldValue, address newValue);
  event RouterUpdated(address factory, address router);

  constructor(address _controller, address _calculator) {
    Controllable.initializeControllable(_controller);
    setCalculator(_calculator);
  }

  // ******************* VIEWS *****************************

  function routerForPair(address pair) external override view returns (address) {
    return factoryToRouter[IUniswapV2Pair(pair).factory()];
  }

  /// @dev Return an array with lp pairs that reflect a route for given tokens
  function findLpsForSwaps(address _tokenIn, address _tokenOut)
  public override view returns (address[] memory){

    address[] memory usedLps = new address[](MAX_ROUTES);
    address[] memory usedTokens = new address[](MAX_ROUTES);
    address[][] memory reverseRouteWithTokens = new address[][](MAX_ROUTES);

    uint256 size = 0;
    address tokenForSearch = _tokenOut;
    // create a raw path from the output token to the input token
    for (uint256 i = 0; i < MAX_ROUTES; i++) {
      (address largestKeyToken,, address lpAddress)
      = calculator.getLargestPool(tokenForSearch, usedLps);
      usedLps[i] = lpAddress;

      address[] memory tmp = new address[](3);
      tmp[0] = tokenForSearch;
      tmp[1] = largestKeyToken;
      tmp[2] = lpAddress;
      reverseRouteWithTokens[size] = tmp;

      size++;
      tokenForSearch = largestKeyToken;

      usedTokens[i] = largestKeyToken;

      if (largestKeyToken == _tokenIn) {
        break;
      }
      // if we are on the last iteration and not found outToken throw the error
      require(i != MAX_ROUTES - 1, "routes not found");
    }

    address[] memory route = new address[](size);

    address[] memory lastLpData = reverseRouteWithTokens[size - 1];
    uint256 j = 0;

    // if last lp contains in/out tokens just return it
    if (
      (lastLpData[0] == _tokenIn || lastLpData[0] == _tokenOut)
      && (lastLpData[1] == _tokenIn || lastLpData[1] == _tokenOut)
    ) {
      j = 1;
      route[0] = lastLpData[2];
    } else {
      // reverse the array and try to find short cuts if exist
      for (uint256 i = size; i > 0; i--) {
        address[] memory lpData = reverseRouteWithTokens[i - 1];

        if (i > 2) {
          for (uint256 k = i - 2; k > 0; k--) {
            address[] memory lpData2 = reverseRouteWithTokens[k - 1];
            if (lpData[0] == lpData2[1]) {
              i = k + 1;
              break;
            }
          }
        }

        route[j] = lpData[2];
        j++;
      }
    }

    // cut empty values from result array
    if (size != j) {
      address[] memory result = new address[](j);
      for (uint256 i = 0; i < j; i++) {
        result[i] = route[i];
      }
      return result;
    }

    return route;
  }

  // ******************** USERS ACTIONS *********************

  /// @dev Approval for token is assumed.
  ///      Swap tokenIn to tokenOut using given lp path
  ///      Input token should supported in PriceCalculator contract
  ///      Slippage tolerance is a number from 0 to 100 that reflect is a percent of acceptable slippage
  function multiSwap(
    address[] memory lps,
    address tokenIn,
    address tokenOut,
    uint256 amount,
    uint256 slippageTolerance
  ) external override {
    require(lps.length > 0, "MC: zero lp");
    require(tokenIn != address(0), "MC: zero tokenIn");
    require(tokenOut != address(0), "MC: zero tokenOut");
    require(amount != 0, "MC: zero amount");
    require(slippageTolerance <= 100, "MC: too high slippage tolerance");
    require(tokenIn != tokenOut, "MC: same in/out");

    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

    address[] memory route = new address[](2);
    route[0] = tokenIn;

    for (uint256 i = 0; i < lps.length; i++) {
      IUniswapV2Pair lp = IUniswapV2Pair(lps[i]);


      if (lp.token0() == route[0]) {
        route[1] = lp.token1();
      } else if (lp.token1() == route[0]) {
        route[1] = lp.token0();
      } else {
        revert("MS: Wrong lp");
      }

      address router = factoryToRouter[lp.factory()];
      require(router != address(0), "MC: router not found");

      uint256 tokenInPrice = calculator.getPriceFromLp(address(lp), route[0]);
      uint256 amountOut = amount.mul(tokenInPrice)
      .mul(10 ** ERC20(route[1]).decimals())
      .div(1e18)
      .div(10 ** ERC20(route[0]).decimals());
      uint256 amountOutMin = amountOut.sub(
        amountOut.mul(slippageTolerance).div(100)
      );

      swap(router, route, amount, amountOutMin);

      amount = IERC20(route[1]).balanceOf(address(this));

      route[0] = route[1];
      route[1] = address(0);
    }

    uint256 tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
    IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);
  }

  // ******************* INTERNAL ***************************

  function pairPrice(IUniswapV2Pair _pair, address _token) internal view returns (uint256) {
    if (_pair.token0() == _token) {
      _pair.getReserves();
    }

    return 0;
  }

  /// @dev Find given token in the given array and return true if it exist
  function isTokensUsed(address[] memory _usedTokens, address _token, uint256 size) internal pure returns (bool) {
    for (uint256 i = 0; i < size; i++) {
      if (_usedTokens[i] == _token) {
        return true;
      }
    }
    return false;
  }

  /// @dev https://uniswap.org/docs/v2/smart-contracts/router02/#swapexacttokensfortokens
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
    IERC20(_route[0]).safeApprove(_router, 0);
    IERC20(_route[0]).safeApprove(_router, _amount);
    return IUniswapV2Router02(_router).swapExactTokensForTokens(
      _amount,
      amountOutMin,
      _route,
      address(this),
      block.timestamp
    );
  }

  // ************************* GOV ACTIONS *******************

  function setRouterForFactory(address factory, address router) external onlyControllerOrGovernance {
    factoryToRouter[factory] = router;
    emit RouterUpdated(factory, router);
  }

  function setCalculator(address _newValue) public onlyControllerOrGovernance {
    require(_newValue != address(0), "MC: zero address");
    emit CalculatorUpdated(address(calculator), _newValue);
    calculator = IPriceCalculator(_newValue);
  }

}
