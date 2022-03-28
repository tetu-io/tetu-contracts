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

import "../../../base/strategies/multi/MaiBalStrategyBase.sol";
import "../../../base/SlotsLib.sol";

/// @title MAI->BAL Multi Strategy Polygon Implementation
/// @author belbix, bogdoslav
contract StrategyMaiBal is MaiBalStrategyBase {
  using SlotsLib for bytes32;

  address private constant _QI = 0x580A84C73811E1839F75d86d75d88cCa0c241fF4;
  address private constant _BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;

  function initialize(
    address _controller,
    address _vault,
    address _underlying,
    address[] memory __pipes
  ) public initializer {
    address[] memory _rewardTokensArray = new address[](2);
    _rewardTokensArray[0] = _QI;
    _rewardTokensArray[1] = _BAL;
    initializeMaiBalStrategyBase(_controller, _underlying, _vault, _rewardTokensArray);
    _initPipes(__pipes);
  }

  /// @dev
  ///      0 - MaiStablecoinPipe
  ///      1 - BalVaultPipe
  function _initPipes(address[] memory __pipes) private {
    require(__pipes.length == 2, "Wrong pipes");

    for (uint i; i < __pipes.length; i++) {
      IPipe(__pipes[i]).setPipeline(address(this));
      _addPipe(IPipe(__pipes[i]));
    }
    // pipe with index 0 must be MaiStablecoinPipe
    _MAI_STABLECOIN_PIPE_SLOT.set(__pipes[0]);
  }


}
