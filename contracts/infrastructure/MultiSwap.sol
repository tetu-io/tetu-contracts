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
import "hardhat/console.sol";
import "./IMultiSwap.sol";

/// @title Contract for complex swaps across multiple platforms
/// @author belbix
contract MultiSwap is Controllable, IMultiSwap {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

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

  /// @dev Return an array with lp pairs that reflect a route for given tokens
  function findLpsForSwaps(address _tokenIn, address _tokenOut)
  public override view returns (address[] memory){
    address[] memory reverseRoute = new address[](MAX_ROUTES);

    address[] memory usedLps = new address[](MAX_ROUTES);
    address[] memory usedTokens = new address[](MAX_ROUTES);
    address[][] memory reverseRouteWithTokens = new address[][](MAX_ROUTES);

    uint256 size = 0;
    address tokenForSearch = _tokenOut;
    for (uint256 i = 0; i < MAX_ROUTES; i++) {
      (address largestKeyToken,, address lpAddress)
      = calculator.getLargestPool(tokenForSearch, usedLps);
      usedLps[i] = lpAddress;

      //      if (!isTokensUsed(
      //        usedTokens,
      //        largestKeyToken,
      //        i
      //      )) {
      reverseRoute[size] = lpAddress;

      address[] memory tmp = new address[](3);
      tmp[0] = tokenForSearch;
      tmp[1] = largestKeyToken;
      tmp[2] = lpAddress;
      reverseRouteWithTokens[size] = tmp;

      size++;
      tokenForSearch = largestKeyToken;
      //      }

      usedTokens[i] = largestKeyToken;

      if (largestKeyToken == _tokenIn) {
        break;
      }
      // if we are on the last iteration not found outToken
      require(i != MAX_ROUTES - 1, "routes not found");
      // we already have biggest lp for OUT token, try to find a lp for create a route to it
    }

    console.log("size", size);

    address[] memory route = new address[](size);

    uint256 j = 0;
    for (uint256 i = size; i > 0; i--) {
      address[] memory tmp = reverseRouteWithTokens[i - 1];

      console.log("--------------------- i", i - 1, ERC20(tmp[0]).symbol(), ERC20(tmp[1]).symbol());

      if (i > 2) {
        for (uint256 k = i - 2; k > 0; k--) {
          address[] memory tmp2 = reverseRouteWithTokens[k - 1];
          console.log("**** k", k - 1, ERC20(tmp2[0]).symbol(), ERC20(tmp2[1]).symbol());
          if (tmp[0] == tmp2[1]) {
            console.log("!!!found short way!", i - 1, k - 1);
            i = k + 1;
            break;
          }
        }
      }

      route[j] = tmp[2];
      j++;
    }

    console.log("j", j, size);
    // cut empty values from result array
    if (size != j) {
      address[] memory result = new address[](j);
      for (uint256 i = 0; i < j; i++) {
        result[i] = route[i];
      }
      return result;
    }

    console.log("route size", route.length);
    return route;
  }

  // ******************** USERS ACTIONS *********************

  /// @dev Approval for token is assumed.
  ///      Swap tokenIn to tokenOut using given lp path
  function multiSwap(
    address[] memory lps,
    address tokenIn,
    address tokenOut,
    uint256 amount,
    uint256 slippageTolerance
  ) external override {
    require(lps.length > 0, "zero lp");
    require(tokenIn != address(0), "zero tokenIn");
    require(tokenOut != address(0), "zero tokenOut");
    require(amount != 0, "zero amount");
    require(slippageTolerance <= 100, "too high slippage tolerance");

    console.log("try to transfer");
    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);

    uint256 priceBeforeSwaps = calculator.getPrice(tokenOut, tokenIn);

    console.log("amount", amount);
    console.log("ERC20(tokenIn).decimals()", ERC20(tokenIn).decimals());
    console.log("priceBeforeSwaps", priceBeforeSwaps);
    console.log("ERC20(tokenOut).decimals()", ERC20(tokenOut).decimals());

    uint256 expectedOutBalance = amount
    .mul(10 ** ERC20(tokenOut).decimals())
    .mul(1e18).div(priceBeforeSwaps).div(10 ** ERC20(tokenIn).decimals());

    uint256 minOutBalance = expectedOutBalance.sub(
      expectedOutBalance.mul(slippageTolerance).div(100)
    );

    address[] memory route = new address[](2);
    route[0] = tokenIn;

    for (uint256 i = 0; i < lps.length; i++) {
      IUniswapV2Pair lp = IUniswapV2Pair(lps[i]);

      if (i == lps.length - 1) {
        // last lp, set tokenOut
        route[1] = tokenOut;
      } else {
        if (lp.token0() == route[0]) {
          route[1] = lp.token1();
        } else if (lp.token1() == route[0]) {
          route[1] = lp.token0();
        }
      }
      require(route[1] != address(0), "wrong lp");

      address router = factoryToRouter[lp.factory()];
      require(router != address(0), "router not found");

      console.log("try to swap", i);
      uint256[] memory amountsAfterSwap = swap(router, route, amount);
      console.log("amountsAfterSwap 0", amountsAfterSwap[0]);
      console.log("amountsAfterSwap 1", amountsAfterSwap[1]);

      amount = IERC20(route[1]).balanceOf(address(this));

      console.log("amount", amount);

      route[0] = route[1];
      route[1] = address(0);
    }

    uint256 tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));

    console.log("result dif", tokenOutBalance, expectedOutBalance, minOutBalance);

    require(tokenOutBalance > minOutBalance, "slippage too high");
    console.log("try to back", tokenOutBalance);
    IERC20(tokenOut).transfer(msg.sender, tokenOutBalance);
  }

  // ******************* INTERNAL ***************************

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
  function swap(address _router, address[] memory _route, uint256 _amount) internal returns (uint256[] memory){
    IERC20(_route[0]).safeApprove(_router, 0);
    IERC20(_route[0]).safeApprove(_router, _amount);
    return IUniswapV2Router02(_router).swapExactTokensForTokens(
      _amount,
      0,
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
    require(_newValue != address(0), "zero address");
    emit CalculatorUpdated(address(calculator), _newValue);
    calculator = IPriceCalculator(_newValue);
  }

}
