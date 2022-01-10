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

import "../third_party/gelato/PokeMeReady.sol";
import "../base/interface/ILinearPipeline.sol";
import "../base/interface/IController.sol";
import "../base/interface/IControllableExtended.sol";

contract GelatoAMBRebalancer is PokeMeReady {

  event GelatoRebalanceAllPipes(address AMBStrategy);

  /// @param _pokeMe Gelato PokeMe address https://docs.gelato.network/resources/contract-addresses
  constructor(address payable _pokeMe) PokeMeReady(_pokeMe) {}

  /// @dev Calls rebalanceAllPipes() for the strategy specified, calls restricted to PokeMe Gelato contract
  /// @param AMBStrategy AMB strategy address
  function rebalanceAllPipes(address AMBStrategy)
  external onlyPokeMe {
    address controller = IControllableExtended(AMBStrategy).controller();
    IController(controller).rebalance(AMBStrategy);
    emit GelatoRebalanceAllPipes(AMBStrategy);
  }

  /// @dev Gelato Resolver, that checks is rebalance needed for the strategy specified
  /// @param AMBStrategy AMB strategy address
  function isRebalanceNeededResolver(address AMBStrategy)
  external view returns (bool canExec, bytes memory execPayload) {
    canExec = ILinearPipeline(AMBStrategy).isRebalanceNeeded();
    execPayload = abi.encodeWithSelector(
      GelatoAMBRebalancer.rebalanceAllPipes.selector,
      AMBStrategy
    );
  }
}
