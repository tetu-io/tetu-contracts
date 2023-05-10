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

import "../openzeppelin/ERC20.sol";

/// @title Utility contract for using on website UI and other integrations
/// @author belbix
contract ContractUtils {

  // ********************* ERC20 UTILS ************************************

  function erc20Names(address[] memory tokens) external view returns (string[] memory) {
    string[] memory result = new string[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).name();
    }
    return result;
  }

  function erc20Symbols(address[] memory tokens) external view returns (string[] memory) {
    string[] memory result = new string[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).symbol();
    }
    return result;
  }

  function erc20Decimals(address[] memory tokens) external view returns (uint8[] memory) {
    uint8[] memory result = new uint8[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).decimals();
    }
    return result;
  }

  function erc20Balances(address[] memory tokens, address adr) external view returns (uint256[] memory) {
    uint256[] memory result = new uint256[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).balanceOf(adr);
    }
    return result;
  }

  function erc20BalancesForAddresses(address token, address[] memory _addresses) external view returns (uint256[] memory) {
    uint256[] memory result = new uint256[](_addresses.length);
    for (uint i = 0; i < _addresses.length; i++) {
      result[i] = ERC20(token).balanceOf(_addresses[i]);
    }
    return result;
  }

  function erc20TotalSupply(address[] memory tokens) external view returns (uint256[] memory) {
    uint256[] memory result = new uint256[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).totalSupply();
    }
    return result;
  }

}
