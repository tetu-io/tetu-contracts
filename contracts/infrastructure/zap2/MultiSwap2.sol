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

  function getReverseRouteData(bytes memory routeData)
  external pure override returns (bytes memory reverseRouteData) {
    require(false, 'MS: Not implemented getReverseRouteData');
    return routeData; // TODO !!! implement
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
  /// @param reverseSwap Do swap at routesData in reverse order
  function multiSwap(
    address tokenIn,
    address tokenOut,
    uint256 amount,
    uint256 slippageTolerance,
    bytes memory routesData,
    bool reverseSwap
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

    // swap routes
    for (uint r = 0; r < routes.length; r++) { // routes
      console.log('******************');
      console.log('weight', r, weights[r]);
      for (uint s = 0; s < routes[r].length; s++) { // steps
        doSwapStepUniswap2(s, routes[r][s], weights[r]);
      }
    }

    uint256 tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
    require(tokenOutBalance != 0, "MS: zero token out amount");
    IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);
    // some tokens have a burn/fee mechanic for transfers so amount can be changed
    // we are recommend to use manual swapping for this kind of tokens
    require(tokenOutBalance <= IERC20(tokenOut).balanceOf(msg.sender),
      "MS: transfer fees forbidden for output Token");
  }


  // ******************* INTERNAL ***************************

  function doSwapStepUniswap2(uint256 stepNumber, Step memory step, uint256 weight)
  internal {
    IUniswapV2Pair pair = IUniswapV2Pair(step.lp);
    console.log(' ');
    console.log(stepNumber, step.lp, step.reverse);

    address tokenIn  =  step.reverse ? pair.token1() : pair.token0();
    address tokenOut =  step.reverse ? pair.token0() : pair.token1();

    address[] memory path = new address[](2);
    path[0] = tokenIn;
    path[1] = tokenOut;
    uint256 amountIn = IERC20(tokenIn).balanceOf(address(this)); // TODO use weights for first step
    uint256 amountOutMin = 1; // TODO

    console.log(IERC20Metadata(tokenIn).symbol(), IERC20Metadata(tokenOut).symbol());

//    uint256 amount0Out = 0;
//    uint256 amount1Out = 0;
//    bytes memory emptyData;

//    IERC20(tokenIn).safeTransferFrom(address(this), address(pair), amountIn);
//    pair.swap(amount0Out, amount1Out, address(this), emptyData);
    address router = routerForPair(step.lp);
    IERC20(tokenIn).safeApprove(router, 0);
    IERC20(tokenIn).safeApprove(router, amountIn);
    {
    try IUniswapV2Router02(router).swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      path,
      address(this),
      block.timestamp
    ) returns (uint256[] memory) {

    } catch Error(string memory reason){
      revert(reason);
    }
    }
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
  }

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint256 _amount) external onlyControllerOrGovernance {
    IERC20(_token).safeTransfer(msg.sender, _amount);
  }

}
