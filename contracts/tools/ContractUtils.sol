//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ContractUtils {

  // ********************* ERC20 UTILS ************************************

  function erc20Names(address[] memory tokens) public view returns (string[] memory) {
    string[] memory result = new string[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).name();
    }
    return result;
  }

  function erc20Symbols(address[] memory tokens) public view returns (string[] memory) {
    string[] memory result = new string[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).symbol();
    }
    return result;
  }

  function erc20Decimals(address[] memory tokens) public view returns (uint8[] memory) {
    uint8[] memory result = new uint8[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).decimals();
    }
    return result;
  }

  function erc20Balances(address[] memory tokens, address adr) public view returns (uint256[] memory) {
    uint256[] memory result = new uint256[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).balanceOf(adr);
    }
    return result;
  }

  function erc20TotalSupply(address[] memory tokens) public view returns (uint256[] memory) {
    uint256[] memory result = new uint256[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      result[i] = ERC20(tokens[i]).totalSupply();
    }
    return result;
  }

}
