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
import "./Pipe.sol";
import "../../../../third_party/uniswap/IWETH.sol";

/// @title Unwrapping Pipe Contract
/// @author bogdoslav
contract UnwrappingPipe is Pipe {

  constructor(address _weth, address _ether) Pipe(
    'UnwrappingPipe',
    _weth,
    _ether
  ) {
  }

  /// @dev unwraps WETH
  /// @param amount to unwrap
  /// @return output amount of output units
  function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
    amount = maxSourceAmount(amount);
    IWETH(sourceToken).withdraw(amount);
    output = address(this).balance;

    if (hasNextPipe()) {
      payable(address(nextPipe)).transfer(output);
    }
  }

  /// @dev wraps WETH back
  /// @param amount to wrap
  /// @return output amount of source units
  function get(uint256 amount) override onlyPipeline  public returns (uint256 output) {
    amount = maxOutputAmount(amount);
    IWETH(sourceToken).deposit{value : amount}();
    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
  }

  /// @dev underlying balance (ETH, MATIC)
  /// @return balance in underlying units
  function outputBalance() override public view returns (uint256) {
    return address(this).balance;
  }

  /// @dev to receive ETH (MATIC).
  receive() external payable {}

}
