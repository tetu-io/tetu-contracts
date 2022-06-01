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

import "../openzeppelin/IERC20.sol";
import "../openzeppelin/IERC20Metadata.sol";
import "../openzeppelin/Address.sol";
import "../third_party/uniswap/IUniswapV2Factory.sol";
import "../third_party/uniswap/IUniswapV2Pair.sol";
import "../third_party/IERC20Name.sol";
import "../swap/libraries/Math.sol";
import "../swap/interfaces/ITetuSwapPair.sol";


/// @title Utility contract for using on website UI and other integrations (like MultiSwap2)
/// @author belbix, bogdoslav
contract ContractUtils {
  using Address for address;

  struct LpData {
    address lp;
    address token0;
    address token1;
  }

  struct ReservesData {
    uint reserve0;
    uint reserve1;
  }

  // ********************* ERC20 UTILS ************************************

  function erc20Names(address[] memory tokens) external view returns (string[] memory) {
    string[] memory result = new string[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = IERC20Name(tokens[i]).name();
    }
    return result;
  }

  function erc20Symbols(address[] memory tokens) external view returns (string[] memory) {
    string[] memory result = new string[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = IERC20Name(tokens[i]).symbol();
    }
    return result;
  }

  // @note Some token contract addresses was destructed or wrong. This function does not revert on such addresses
  function erc20SymbolsSafe(address[] memory tokens) external view returns (string[] memory result) {
   result = new string[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      address token = tokens[i];
      if (token.isContract()) {
        try IERC20Name(token).symbol() returns (string memory symbol) {
          result[i] = symbol;
        } catch Error(string memory /*reason*/) {
        } catch Panic(uint /*errorCode*/) {
        } catch (bytes memory /*lowLevelData*/) {
        }
      }
    }
  }

  function erc20Decimals(address[] memory tokens) external view returns (uint8[] memory) {
    uint8[] memory result = new uint8[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = IERC20Metadata(tokens[i]).decimals();
    }
    return result;
  }

  function erc20Balances(address[] memory tokens, address adr) external view returns (uint[] memory) {
    uint[] memory result = new uint[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = IERC20(tokens[i]).balanceOf(adr);
    }
    return result;
  }

  function erc20BalancesForAddresses(address token, address[] memory _addresses) external view returns (uint[] memory) {
    uint[] memory result = new uint[](_addresses.length);
    for (uint i = 0; i < _addresses.length; i++) {
      result[i] = IERC20(token).balanceOf(_addresses[i]);
    }
    return result;
  }

  function erc20TotalSupply(address[] memory tokens) external view returns (uint[] memory) {
    uint[] memory result = new uint[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = IERC20(tokens[i]).totalSupply();
    }
    return result;
  }

  // ********************* UNISWAP V2 UTILS ************************************

  /// @dev Used for MultiSwap2
  function loadPairsUniswapV2(address factoryAddress, uint skip, uint count )
  external view returns (LpData[] memory pairs) {
    IUniswapV2Factory factory = IUniswapV2Factory(factoryAddress);
    uint allPairsLength = factory.allPairsLength();
    uint maxPair = Math.min(allPairsLength, skip + count);
    pairs = new LpData[](maxPair - skip);

    uint b = 0;
    for (uint p = skip; p < maxPair; p++) {
      address pairAddress = factory.allPairs(p);
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      address token0 = pair.token0();
      address token1 = pair.token1();

      pairs[b++] = LpData({lp:pairAddress, token0:token0, token1: token1});
    }
  }

  /// @dev Used for MultiSwap2
  function loadPairsReserves(address[] memory pairs)
  external view returns (ReservesData[] memory data) {
    uint len = pairs.length;
    data = new ReservesData[](len);

    for (uint i = 0; i < len; i++) {
      address pairAddress = pairs[i];
      IUniswapV2Pair pair = IUniswapV2Pair(pairAddress);
      try pair.getReserves() returns (uint112 reserve0, uint112 reserve1, uint32) {
        data[i] = ReservesData({reserve0:reserve0, reserve1:reserve1});
      } catch { // any error interpret as nil reserves
        data[i] = ReservesData({reserve0:0, reserve1:0});
      }
    }
  }

  /// @dev Used for MultiSwap2
  function loadPairsFees(address[] memory pairs)
  external view returns (uint16[] memory fees) {
    uint len = pairs.length;
    fees = new uint16[](len);

    for (uint i = 0; i < len; i++) {
      fees[i] = uint16(_getTetuSwapFee(pairs[i]));
    }
  }

  /// @dev returns fee for tetuswap or default uniswap v2 fee for other swaps
  function _getTetuSwapFee(address pair)
  internal view returns (uint) {
    try ITetuSwapPair(pair).fee() returns (uint fee) {
      return fee;
    } catch Error(string memory /*reason*/) {
    } catch Panic(uint /*errorCode*/) {
    } catch (bytes memory /*lowLevelData*/) {
    }
    return 30;
  }

}
