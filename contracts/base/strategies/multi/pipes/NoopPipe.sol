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

import "./Pipe.sol";

/// @title No operation Pipe Contract
/// @author bogdoslav
contract NoopPipe is Pipe {
  using SafeERC20 for IERC20;

  constructor(address token) Pipe(
    'NoopPipe',
    token,
    token
  ) {
  }

  /// @dev Just send to next pipe
  function put(uint256) override onlyPipeline public returns (uint256 output) {
    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(outputToken, output);
  }

  /// @dev Just send to prev pipe
  function get(uint256) override onlyPipeline public returns (uint256 output) {
    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
  }

}
