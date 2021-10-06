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

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../../base/governance/Controllable.sol";

/// @title Storage for any PayrollClerk variables
/// @dev If you will change a key value it will require setup it again
/// @author belbix
abstract contract PayrollClerkStorage is Initializable, Controllable {

  constructor() {
    assert(_CALCULATOR_SLOT == bytes32(uint256(keccak256("eip1967.calculator")) - 1));
  }

  // don't change names or ordering!
  string public constant VERSION = "1.0.0";
  uint256 constant public FULL_RATIO = 100;
  uint256 constant public BUST_STEP = 300;
  uint256 constant public MAX_HOURLY_RATE = 200;
  uint256 constant public MAX_BOOST = 3;
  bytes32 internal constant _CALCULATOR_SLOT = 0xF22095D134BC46C0780E7917D889873E9978E54129C92BF2AC021A7ED70FB3B7;

  address[] public tokens;
  address[] public workers;
  mapping(address => uint256) public baseHourlyRates;
  mapping(address => uint256) public workedHours;
  mapping(address => uint256) public earned;
  mapping(address => uint256) public tokenRatios;
  mapping(address => string) public workerNames;
  mapping(address => string) public workerRoles;
  mapping(address => bool) public boostActivated;

  event UpdateCalculator(address oldValue, address newValue);

  function calculator() public view returns (address adr) {
    bytes32 slot = _CALCULATOR_SLOT;
    assembly {
      adr := sload(slot)
    }
  }

  function setCalculator(address _newValue) external onlyControllerOrGovernance {
    require(_newValue != address(0), "zero address");
    emit UpdateCalculator(calculator(), _newValue);
    bytes32 slot = _CALCULATOR_SLOT;
    assembly {
      sstore(slot, _newValue)
    }
  }

  //slither-disable-next-line unused-state
  uint256[50] private ______gap;
}
