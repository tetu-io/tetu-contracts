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

import "../../../base/strategies/multi/AaveMaiBalStrategyBase.sol";

/// @title AAVE->MAI->BAL Multi Strategy Polygon Implementation
/// @author belbix, bogdoslav
contract StrategyAaveMaiBal is AaveMaiBalStrategyBase {

  address private constant _WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
  address private constant _QI = 0x580A84C73811E1839F75d86d75d88cCa0c241fF4;
  address private constant _BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;

  address[] private _rewardTokensArray = [_WMATIC, _QI, _BAL];

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    address[] memory _pipes
  ) AaveMaiBalStrategyBase(_controller, _underlying, _vault, _rewardTokensArray) {
    _initPipes(_pipes);
  }

  /// @dev 0 - AaveAmPipe
  ///      1 - MaiCamPipe
  ///      2 - MaiStablecoinPipe
  ///      3 - BalVaultPipe
  function _initPipes(address[] memory _pipes) private {
    require(_pipes.length == 4, "Wrong pipes");
    for (uint i; i < _pipes.length; i++) {
      IPipe(_pipes[i]).setPipeline(address(this));
      _addPipe(IPipe(_pipes[i]));
    }
    // pipe with index 2 must be MaiStablecoinPipe
    _maiStablecoinPipe = IMaiStablecoinPipe(_pipes[2]);
  }


}
