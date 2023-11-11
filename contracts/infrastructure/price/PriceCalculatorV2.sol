// SPDX-License-Identifier: MIT

import "./IPriceCalculator.sol";
import "../../base/interfaces/ISmartVault.sol";
import "../../base/interfaces/ITetuLiquidator.sol";
import "../../third_party/uniswap/IUniPoolV3.sol";
import "../../third_party/uniswap/IUniFactoryV3.sol";
import "../../third_party/curve/ICurveLpToken.sol";
import "../../third_party/curve/ICurveMinter.sol";
import "../../third_party/IERC20Extended.sol";
import "../../third_party/balancer/IBPT.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../third_party/dystopia/IDystopiaPair.sol";
import "../../openzeppelin/Math.sol";
import "../../openzeppelin/EnumerableSet.sol";
import "../../openzeppelin/IERC4626.sol";
import "../../openzeppelin/Initializable.sol";

pragma solidity 0.8.4;

interface IPoolFactory {
  function getPool(address tokenA, address tokenB, bool stable) external view returns (address);
}


interface IPool {

  function factory() external view returns (address);

  function token0() external view returns (address);

  function token1() external view returns (address);

  function tokens() external view returns (address, address);

  function reserve0() external view returns (uint);

  function reserve1() external view returns (uint);

  function stable() external view returns (bool);

  function getReserves() external view returns (uint _reserve0, uint _reserve1, uint _blockTimestampLast);

  function getAmountOut(uint amountIn, address tokenIn) external view returns (uint);

  function decimals() external view returns (uint);

  function totalSupply() external view returns (uint);
}

interface ITetuVaultV2 {
  function sharePrice() external view returns (uint);

  function asset() external view returns (address assetTokenAddress);
}

/// @title Calculate current price for token using data from swap platforms or liquidator.
/// @author belbix
contract PriceCalculatorV2 is Initializable, IPriceCalculator {
  using EnumerableSet for EnumerableSet.AddressSet;

  enum FactoryType{
    SOLIDLY,
    UNI3
  }

  // ************ CONSTANTS **********************

  string public constant VERSION = "2.0.0";
  uint internal constant PRECISION_DECIMALS = 18;
  uint internal constant DEPTH = 20;
  address internal constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  // ************ VARIABLES **********************
  //    !!! DON'T CHANGE ORDERING !!!

  uint public created;
  address  public governance;
  address  public defaultToken;
  address public tetuLiquidator;

  EnumerableSet.AddressSet internal solidlyFactories;
  EnumerableSet.AddressSet internal uni3Factories;
  EnumerableSet.AddressSet internal keyTokens;

  mapping(address => address) public replacementTokens;

  // ********** EVENTS ****************************

  event DefaultTokenChanged(address oldToken, address newToken);
  event KeyTokenAdded(address newKeyToken);
  event KeyTokenRemoved(address keyToken);
  event SolidlyFactoryChanged(address factoryAddress, bool add);
  event Uni3FactoryChanged(address factoryAddress, bool add);
  event ReplacementTokenUpdated(address token, address replacementToken);
  event ChangeLiquidator(address liquidator);

  constructor() {}

  function initialize() external initializer {
    governance = msg.sender;
  }

  function isGovernance(address adr) public view returns (bool) {
    return governance == adr;
  }

  /// @dev Allow operation only for Controller or Governance
  function _onlyGov() internal view {
    require(isGovernance(msg.sender), "!gov");
  }

  // ************* GOVERNANCE ACTIONS ***************

  function changeGovernance(address newGov) external {
    _onlyGov();
    require(newGov != address(0), "zero address");
    governance = newGov;
  }

  function setDefaultToken(address _newDefaultToken) external {
    _onlyGov();
    require(_newDefaultToken != address(0), "PC: zero address");
    emit DefaultTokenChanged(defaultToken, _newDefaultToken);
    defaultToken = _newDefaultToken;
  }

  function changeKeyTokens(address[] memory tokens, bool add) external {
    _onlyGov();
    for (uint i; i < tokens.length; ++i) {
      address token = tokens[i];
      if (add) {
        keyTokens.add(token);
        emit KeyTokenAdded(token);
      } else {
        keyTokens.remove(token);
        emit KeyTokenRemoved(token);
      }
    }
  }

  function changeSolidlyFactory(address _factoryAddress, bool add) external {
    _onlyGov();
    if (add) {
      solidlyFactories.add(_factoryAddress);
    } else {
      solidlyFactories.remove(_factoryAddress);
    }
    emit SolidlyFactoryChanged(_factoryAddress, add);
  }

  function changeUni3Factory(address _factoryAddress, bool add) external {
    _onlyGov();
    if (add) {
      uni3Factories.add(_factoryAddress);
    } else {
      uni3Factories.remove(_factoryAddress);
    }
    emit Uni3FactoryChanged(_factoryAddress, add);
  }

  function setReplacementTokens(address _inputToken, address _replacementToken) external {
    _onlyGov();
    replacementTokens[_inputToken] = _replacementToken;
    emit ReplacementTokenUpdated(_inputToken, _replacementToken);
  }

  function setTetuLiquidator(address liquidator) external {
    _onlyGov();
    tetuLiquidator = liquidator;
    emit ChangeLiquidator(liquidator);
  }

  ///////////////////////////////////////////////////////
  //             MAIN LOGIC
  ///////////////////////////////////////////////////////

  function getPriceWithDefaultOutput(address token) external view override returns (uint) {
    return getPrice(token, defaultToken);
  }

  //Main function of the contract. Gives the price of a given token in the defined output token.
  //The contract allows for input tokens to be LP tokens from Uniswap forks.
  //In case of LP token, the underlying tokens will be found and valued to get the price.
  // Output token should exist int the keyTokenList
  function getPrice(address token, address outputToken) public view override returns (uint) {

    if (token == outputToken) {
      return (10 ** PRECISION_DECIMALS);
    }

    uint liqPrice = tryToGetPriceFromLiquidator(token, outputToken);
    if (liqPrice != 0) {
      return liqPrice;
    }

    uint rate = 1;
    uint rateDenominator = 1;
    // check if it is a vault need to return the underlying price
    uint tetuVaultV1SharePrice = isTetuVaultV1(ISmartVault(token));
    if (tetuVaultV1SharePrice != 0) {
      rate = tetuVaultV1SharePrice;
      address underlying = ISmartVault(token).underlying();
      token = underlying;
      rateDenominator *= 10 ** IERC20Extended(token).decimals();
      // some vaults can have another vault as underlying
      uint tetuVaultV1SharePrice2 = isTetuVaultV1(ISmartVault(token));
      if (tetuVaultV1SharePrice2 != 0) {
        rate = rate * tetuVaultV1SharePrice2;
        token = ISmartVault(token).underlying();
        rateDenominator *= (10 ** IERC20Extended(token).decimals());
      }
    }

    uint tetuVaultV2SharePrice = isTetuVaultV2(ITetuVaultV2(token));
    if (tetuVaultV2SharePrice != 0) {
      rate = rate * tetuVaultV2SharePrice;
      token = ITetuVaultV2(token).asset();
      rateDenominator *= (10 ** IERC20Extended(token).decimals());
    }

    // if the token exists in the mapping, we'll swap it for the replacement
    // example amBTC/renBTC pool -> wbtc
    if (replacementTokens[token] != address(0)) {
      token = replacementTokens[token];
    }

    uint price;
    if (isLpToken(token)) {
      price = _calculateUniLikeLpPrice(token, outputToken);
    } else if (isBPT(token)) {
      price = _calculateBPTPrice(token, outputToken);
    } else if (isWithCurveMinter(token)) {
      price = _calculateWithCurveMinterPrice(token, outputToken);
    } else {
      address[] memory usedLps = new address[](DEPTH);
      price = computePrice(token, outputToken, usedLps, 0);
    }

    return price * rate / rateDenominator;
  }

  function isLpToken(address token) public view returns (bool) {
    address factory;
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IPool(token).factory() returns (address _factory) {
      factory = _factory;
    } catch {}
    return solidlyFactories.contains(factory);
  }

  function isBPT(address token) public view returns (bool) {
    IBPT bpt = IBPT(token);
    try bpt.getVault() returns (address vault){
      return (vault == BALANCER_VAULT);
    } catch {}
    return false;
  }

  function isWithCurveMinter(address pool) public view returns (bool success) {
    try ICurveLpToken(pool).minter() returns (address result){
      if (result != address(0)) {
        return true;
      }
    } catch {}
    return false;
  }

  /// @dev Get underlying tokens and amounts for LP
  function getLpUnderlying(address lpAddress) public view returns (address[2] memory, uint[2] memory) {
    IPool lp = IPool(lpAddress);
    address[2] memory tokens;
    uint[2] memory amounts;
    tokens[0] = lp.token0();
    tokens[1] = lp.token1();
    uint token0Decimals = IERC20Extended(tokens[0]).decimals();
    uint token1Decimals = IERC20Extended(tokens[1]).decimals();
    uint supplyDecimals = lp.decimals();
    (uint reserve0, uint reserve1,) = lp.getReserves();
    uint totalSupply = lp.totalSupply();
    if (reserve0 == 0 || reserve1 == 0 || totalSupply == 0) {
      amounts[0] = 0;
      amounts[1] = 0;
      return (tokens, amounts);
    }
    amounts[0] = reserve0 * 10 ** (supplyDecimals - token0Decimals + PRECISION_DECIMALS) / totalSupply;
    amounts[1] = reserve1 * 10 ** (supplyDecimals - token1Decimals + PRECISION_DECIMALS) / totalSupply;
    return (tokens, amounts);
  }

  /// @dev General function to compute the price of a token vs the defined output token.
  function computePrice(
    address token,
    address outputToken,
    address[] memory usedLps,
    uint deep
  ) public view returns (uint) {
    if (token == outputToken) {
      return 10 ** PRECISION_DECIMALS;
    } else if (token == address(0)) {
      return 0;
    }

    require(deep < DEPTH, "PC: too deep");

    (,address keyToken,,address lpAddress,FactoryType factoryType) = getLargestPool(token, usedLps);

    require(lpAddress != address(0), string(abi.encodePacked("PC: No LP for 0x", _toAsciiString(token))));
    usedLps[deep] = lpAddress;
    deep++;

    uint lpPrice;
    if (factoryType == FactoryType.SOLIDLY) {
      lpPrice = getPriceFromSolidly(lpAddress, token);
    } else if (factoryType == FactoryType.UNI3) {
      lpPrice = getUniV3Price(lpAddress, token);
    }

    uint keyTokenPrice = getPrice(keyToken, outputToken);
    return lpPrice * keyTokenPrice / 10 ** PRECISION_DECIMALS;
  }

  /// @dev Gives the LP with largest liquidity for a given token
  ///      and a given tokenset (either keyTokens or pricingTokens)
  function getLargestPool(address token, address[] memory usedLps) public view returns (
    uint largestLpSize,
    address largestKeyToken,
    address largestFactory,
    address largestPool,
    FactoryType factoryType
  ) {

    address[] memory _keyTokens = keyTokens.values();
    for (uint i; i < _keyTokens.length; ++i) {
      if (token == _keyTokens[i]) {
        continue;
      }

      // --- SOLIDLY DEXs

      address[] memory _solidlyFactories = solidlyFactories.values();

      for (uint j; j < _solidlyFactories.length; ++j) {
        (uint poolSize, address lp) = findSolidlyLp(_solidlyFactories[j], token, _keyTokens[i]);

        if (_arrayContains(usedLps, lp)) {
          continue;
        }

        if (poolSize > largestLpSize) {
          largestLpSize = poolSize;
          largestKeyToken = _keyTokens[i];
          largestPool = lp;
          factoryType = FactoryType.SOLIDLY;
        }
      }

      // --- UNIv3 DEXs

      address[] memory _uni3Factories = uni3Factories.values();

      for (uint j; j < _uni3Factories.length; ++j) {
        (uint poolSize, address lp) = findUni3Lp(_uni3Factories[j], token, _keyTokens[i]);

        if (_arrayContains(usedLps, lp)) {
          continue;
        }

        if (poolSize > largestLpSize) {
          largestLpSize = poolSize;
          largestKeyToken = _keyTokens[i];
          largestPool = lp;
          factoryType = FactoryType.UNI3;
        }
      }
    }

    return (
      largestLpSize,
      largestKeyToken,
      largestFactory,
      largestPool,
      factoryType
    );
  }

  function findSolidlyLp(address _factory, address token, address tokenOpposite) public view returns (uint, address){
    address sPair = IPoolFactory(_factory).getPool(token, tokenOpposite, true);
    address vPair = IPoolFactory(_factory).getPool(token, tokenOpposite, false);
    uint sReserve = getLpSize(sPair, token);
    uint vReserve = getLpSize(vPair, token);
    if (sReserve > vReserve) {
      return (sReserve, sPair);
    } else {
      return (vReserve, vPair);
    }
  }

  function findUni3Lp(address _factory, address token, address tokenOpposite) public view returns (uint, address){
    address pairAddress;
    uint reserve;
    uint[] memory fees = new uint[](4);
    fees[0] = 100;
    fees[1] = 500;
    fees[2] = 3000;
    fees[3] = 10000;
    for (uint i; i < fees.length; ++i) {
      address pairAddressTmp = IUniFactoryV3(_factory).getPool(token, tokenOpposite, uint24(fees[i]));
      if (pairAddressTmp != address(0)) {
        uint reserveTmp = getUniV3Reserve(pairAddressTmp, token);
        if (reserveTmp > reserve) {
          pairAddress = pairAddressTmp;
          reserve = reserveTmp;
        }
      }
    }
    return (reserve, pairAddress);
  }

  function getUniV3Reserve(address pairAddress, address token) public view returns (uint) {
    return IERC20(token).balanceOf(pairAddress);
  }

  function getLpSize(address pairAddress, address token) public view returns (uint) {
    if (pairAddress == address(0)) {
      return 0;
    }
    IPool pair = IPool(pairAddress);
    address token0 = pair.token0();
    (uint poolSize0, uint poolSize1,) = pair.getReserves();
    uint poolSize = (token == token0) ? poolSize0 : poolSize1;
    return poolSize;
  }

  //Generic function giving the price of a given token vs another given token on Swap platform.
  function getPriceFromSolidly(address lpAddress, address token) public view returns (uint) {
    (address token0, address token1) = IPool(lpAddress).tokens();
    uint tokenInDecimals = token == token0 ? IERC20Extended(token0).decimals() : IERC20Extended(token1).decimals();
    uint tokenOutDecimals = token == token1 ? IERC20Extended(token0).decimals() : IERC20Extended(token1).decimals();
    uint out = IPool(lpAddress).getAmountOut(10 ** tokenInDecimals, token);
    return out * (10 ** PRECISION_DECIMALS) / (10 ** tokenOutDecimals);

  }

  function _countDigits(uint n) internal pure returns (uint){
    if (n == 0) {
      return 0;
    }
    uint count = 0;
    while (n != 0) {
      n = n / 10;
      ++count;
    }
    return count;
  }

  /// @dev Return current price without amount impact.
  function getUniV3Price(
    address pool,
    address tokenIn
  ) public view returns (uint) {
    address token0 = IUniPoolV3(pool).token0();
    address token1 = IUniPoolV3(pool).token1();

    uint tokenInDecimals = tokenIn == token0 ? IERC20Extended(token0).decimals() : IERC20Extended(token1).decimals();
    uint tokenOutDecimals = tokenIn == token1 ? IERC20Extended(token0).decimals() : IERC20Extended(token1).decimals();
    (uint160 sqrtPriceX96,,,,,,) = IUniPoolV3(pool).slot0();

    uint divider = Math.max(10 ** tokenOutDecimals / 10 ** tokenInDecimals, 1);
    uint priceDigits = _countDigits(uint(sqrtPriceX96));
    uint purePrice;
    uint precision;
    if (tokenIn == token0) {
      precision = 10 ** ((priceDigits < 29 ? 29 - priceDigits : 0) + 18);
      uint part = uint(sqrtPriceX96) * precision / 2 ** 96;
      purePrice = part * part;
    } else {
      precision = 10 ** ((priceDigits > 29 ? priceDigits - 29 : 0) + 18);
      uint part = 2 ** 96 * precision / uint(sqrtPriceX96);
      purePrice = part * part;
    }
    return purePrice / divider / precision / (precision > 1e18 ? (precision / 1e18) : 1) * 1e18 / (10 ** tokenOutDecimals);
  }

  function tryToGetPriceFromLiquidator(address tokenIn, address tokenOut) public view returns (uint) {
    ITetuLiquidator liquidator = ITetuLiquidator(tetuLiquidator);
    if (address(liquidator) == address(0)) {
      return 0;
    }

    (ITetuLiquidator.PoolData[] memory route,) = liquidator.buildRoute(tokenIn, tokenOut);
    if (route.length == 0) {
      return 0;
    }
    uint price = liquidator.getPriceForRoute(route, 0);
    return price * 1e18 / 10 ** IERC20Extended(tokenOut).decimals();
  }

  function isTetuVaultV1(ISmartVault vault) public view returns (uint) {
    try vault.getPricePerFullShare() returns (uint sharePrice){
      return sharePrice;
    } catch {}
    return 0;
  }

  function isTetuVaultV2(ITetuVaultV2 vault) public view returns (uint) {
    try vault.sharePrice() returns (uint sharePrice){
      return sharePrice;
    } catch {}
    return 0;
  }

  // ************* INTERNAL *****************

  function _toAsciiString(address x) internal pure returns (string memory) {
    bytes memory s = new bytes(40);
    for (uint i = 0; i < 20; i++) {
      bytes1 b = bytes1(uint8(uint(uint160(x)) / (2 ** (8 * (19 - i)))));
      bytes1 hi = bytes1(uint8(b) / 16);
      bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
      s[2 * i] = _char(hi);
      s[2 * i + 1] = _char(lo);
    }
    return string(s);
  }

  function _char(bytes1 b) internal pure returns (bytes1 c) {
    if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
    else return bytes1(uint8(b) + 0x57);
  }

  function _isEqualString(string memory arg1, string memory arg2) internal pure returns (bool) {
    bool check = (keccak256(abi.encodePacked(arg1)) == keccak256(abi.encodePacked(arg2))) ? true : false;
    return check;
  }

  function _arrayContains(address[] memory usedLps, address lp) internal pure returns (bool) {
    for (uint d = 0; d < usedLps.length; d++) {
      if (usedLps[d] == lp) {
        return true;
      }
    }
    return false;
  }

  function _normalizePrecision(uint amount, uint decimals) internal pure returns (uint){
    return amount * (10 ** PRECISION_DECIMALS) / (10 ** decimals);
  }

  function _calculateUniLikeLpPrice(address token, address outputToken) internal view returns (uint price) {
    address[2] memory tokens;
    uint[2] memory amounts;
    (tokens, amounts) = getLpUnderlying(token);
    for (uint i = 0; i < 2; i++) {
      uint priceToken = getPrice(tokens[i], outputToken);
      if (priceToken == 0) {
        return 0;
      }
      uint tokenValue = priceToken * amounts[i] / 10 ** PRECISION_DECIMALS;
      price += tokenValue;
    }

    return price;
  }

  function _calculateBPTPrice(address token, address outputToken) internal view returns (uint){
    IBPT bpt = IBPT(token);
    address balancerVault = bpt.getVault();
    bytes32 poolId = bpt.getPoolId();
    uint totalBPTSupply = bpt.totalSupply();
    (IERC20[] memory poolTokens, uint[] memory balances,) = IBVault(balancerVault).getPoolTokens(poolId);

    uint totalPrice = 0;
    uint[] memory prices = new uint[](poolTokens.length);
    for (uint i = 0; i < poolTokens.length; i++) {
      uint tokenDecimals = IERC20Extended(address(poolTokens[i])).decimals();
      uint tokenPrice;
      if (token != address(poolTokens[i])) {
        if (prices[i] == 0) {
          tokenPrice = getPrice(address(poolTokens[i]), outputToken);
          prices[i] = tokenPrice;
        } else {
          tokenPrice = prices[i];
        }
      } else {
        // if token the same as BPT assume it has the same price as another one token in the pool
        uint ii = i == 0 ? 1 : 0;
        if (prices[ii] == 0) {
          tokenPrice = getPrice(address(poolTokens[ii]), outputToken);
          prices[ii] = tokenPrice;
        } else {
          tokenPrice = prices[ii];
        }
      }
      // unknown token price
      if (tokenPrice == 0) {
        return 0;
      }
      totalPrice = totalPrice + tokenPrice * balances[i] * 10 ** PRECISION_DECIMALS / 10 ** tokenDecimals;

    }
    return totalPrice / totalBPTSupply;
  }

  function _calculateConvexPrice(address token, address outputToken) internal view returns (uint price){
    ICurveMinter minter = ICurveMinter(token);
    price = _calculateCurveMinterPrice(minter, token, outputToken);
  }

  function _calculateWithCurveMinterPrice(address token, address outputToken) internal view returns (uint price){
    ICurveMinter minter = ICurveMinter(ICurveLpToken(token).minter());
    price = _calculateCurveMinterPrice(minter, token, outputToken);
  }

  function _calculateCurveMinterPrice(ICurveMinter minter, address token, address outputToken) internal view returns (uint price){
    uint tvl = 0;
    for (uint i = 0; i < 3; i++) {
      address coin = _getCoins(minter, i);
      if (coin == address(0)) {
        break;
      }
      uint balance = _normalizePrecision(minter.balances(i), IERC20Extended(coin).decimals());
      uint priceToken = getPrice(coin, outputToken);
      if (priceToken == 0) {
        return 0;
      }

      uint tokenValue = priceToken * balance / 10 ** PRECISION_DECIMALS;
      tvl += tokenValue;
    }
    price = tvl * (10 ** PRECISION_DECIMALS)
      / _normalizePrecision(IERC20Extended(token).totalSupply(), IERC20Extended(token).decimals());
  }

  function _getCoins(ICurveMinter minter, uint index) internal view returns (address) {
    try minter.coins{gas: 6000}(index) returns (address coin) {
      return coin;
    } catch {}
    return address(0);
  }
}
