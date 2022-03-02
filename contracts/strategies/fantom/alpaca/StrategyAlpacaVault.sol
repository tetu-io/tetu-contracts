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

import "../../../base/strategies/alpaca/AlpacaVaultBase.sol";

contract StrategyAlpacaVault is AlpacaVaultBase {

  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.ALPACA;

  address private constant _FAIR_LAUNCH = address(0x838B7F64Fa89d322C563A6f904851A13a164f84C);

  address private constant ALPACA = address(0xaD996A45fd2373ed0B10Efa4A8eCB9de445A4302);
  address[] private _poolRewards = [ALPACA];
  address[] private _assets;

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    uint _poolId,
    address _alpacaVault
  ) AlpacaVaultBase(
    _controller,
    _vault,
    _underlying,
    _poolRewards,
    _alpacaVault,
    _FAIR_LAUNCH,
    _poolId
  ) {
    require(_underlying != address(0), "zero underlying");
    require(_alpacaVault != address(0), "zero alpacaVault");
    _assets.push(_underlying);
  }

  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }
}
