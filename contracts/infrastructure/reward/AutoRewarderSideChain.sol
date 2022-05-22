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

import "./AutoRewarder.sol";

/// @title Calculate recommended reward amount for vaults and distribute it
/// @dev Use with TetuProxyGov
/// @author belbix
contract AutoRewarderSideChain is AutoRewarder {

  /// @dev Stub max amount to 200k
  function maxRewardsPerPeriod() public pure override returns (uint256) {
    return 200_000 * PRECISION;
  }

}
