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
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../base/governance/Controllable.sol";
import "../infrastructure/IPriceCalculator.sol";

/// @title View data reader for using on website UI and other integrations
/// @author belbix
contract ContractReader is Initializable, Controllable {

  string public constant VERSION = "1.0.0";
  uint256 constant public PRECISION = 1e18;
  string private constant _CALCULATOR = "calculator";
  mapping(bytes32 => address) internal tools;

  function initialize(address _controller, address _calculator) external initializer {
    Controllable.initializeControllable(_controller);
    tools[keccak256(abi.encodePacked(_CALCULATOR))] = _calculator;
  }

  event ToolAddressUpdated(string name, address newValue);
  














  // normalized precision
  //noinspection NoReturn
  function getPrice(address _token) public view returns (uint256) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IPriceCalculator(priceCalculator()).getPriceWithDefaultOutput(_token) returns (uint256 price){
      return price;
    } catch {
      return 0;
    }
  }

  function normalizePrecision(uint256 amount, uint256 decimals) internal pure returns (uint256){
    return amount.mul(PRECISION).div(10 ** decimals);
  }

  // *********** GOVERNANCE ACTIONS *****************

  function setPriceCalculator(address newValue) external onlyControllerOrGovernance {
    tools[keccak256(abi.encodePacked(_CALCULATOR))] = newValue;
    emit ToolAddressUpdated(_CALCULATOR, newValue);
  }

}
