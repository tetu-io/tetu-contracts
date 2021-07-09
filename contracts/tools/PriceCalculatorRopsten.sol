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

contract PriceCalculatorRopsten is Initializable, PriceCalculator{
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  // Mock USDC is default
  address  constant public DEFAULT_BASE_TOKEN = 0x713Ea2FE8bE97aa211a08F08F781cdD407b79E86;

  function initialize(address _controller) public initializer {
    PriceCalculator.initializeBase(_controller);
    //Mock USDC
    addKeyToken(0x713Ea2FE8bE97aa211a08F08F781cdD407b79E86);

    // sushiswap
    addSwapPlatform(0xc35DADB65012eC5796536bD9864eD8773aBc74C4, "SushiSwap LP Token");
  }

  function getPriceWithDefaultOutput(address token) external view override returns (uint256) {
    return getPrice(token, DEFAULT_BASE_TOKEN);
  }
}
