//SPDX-License-Identifier: Unlicense

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../base/interface/IGovernable.sol";
import "../base/governance/Controllable.sol";
import "../third_party/uniswap/IUniswapV2Factory.sol";
import "../third_party/uniswap/IUniswapV2Pair.sol";
import "./IPriceCalculator.sol";
import "../base/interface/ISmartVault.sol";
import "./PriceCalculator.sol";

pragma solidity 0.7.6;

contract PriceCalculatorMatic is Initializable, PriceCalculator{
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  // USDC is default
  address  constant public DEFAULT_BASE_TOKEN = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;

  function initialize(address _controller) public initializer {
    PriceCalculator.initializeBase(_controller);
    //USDC
    addKeyToken(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174);
    //WETH
    addKeyToken(0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619);
    //DAI
    addKeyToken(0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063);
    //USDT
    addKeyToken(0xc2132D05D31c914a87C6611C10748AEb04B58e8F);
    //WBTC
    addKeyToken(0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6);
    //WMATIC
    addKeyToken(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
    //QUICK
    addKeyToken(0x831753DD7087CaC61aB5644b308642cc1c33Dc13);

    // quickswap
    addSwapPlatform(0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32, "Uniswap V2");
    // sushiswap
    addSwapPlatform(0xc35DADB65012eC5796536bD9864eD8773aBc74C4, "SushiSwap LP Token");
    // wault
    addSwapPlatform(0xa98ea6356A316b44Bf710D5f9b6b4eA0081409Ef, "WaultSwap LP");
  }

  function getPriceWithDefaultOutput(address token) external view override returns (uint256) {
    return getPrice(token, DEFAULT_BASE_TOKEN);
  }
}
