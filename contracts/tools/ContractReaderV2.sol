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

import "../openzeppelin/SafeMath.sol";
import "../base/governance/ControllableV2.sol";
import "../base/interfaces/IBookkeeper.sol";
import "../base/interfaces/ISmartVault.sol";
import "../base/interfaces/IVaultController.sol";
import "../base/interfaces/IStrategy.sol";
import "../base/interfaces/IStrategySplitter.sol";
import "../infrastructure/price/IPriceCalculator.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/Math.sol";
import "../third_party/IERC20Extended.sol";
import "../openzeppelin/IERC4626.sol";

/// @title View data reader for using on website UI and other integrations
/// @author belbix
contract ContractReaderV2 is Initializable {
  using SafeMath for uint256;

  // *********** CONSTANTS *****************

  string public constant VERSION = "2.0.0";
  uint256 constant public PRECISION = 1e18;

  // *********** VARIABLES *****************

  uint public created;
  address  public governance;
  mapping(bytes32 => address) internal tools;

  // *********** EVENTS *****************

  event ToolAddressUpdated(address newValue);

  // *********** INIT AND INTERNAL *****************

  function initialize(address _calculator) external initializer {
    created = block.number;
    governance = msg.sender;
    tools[keccak256(abi.encodePacked("calculator"))] = _calculator;
  }

  function isGovernance(address adr) public view returns (bool) {
    return governance == adr;
  }

  /// @dev Allow operation only for Controller or Governance
  modifier onlyGov() {
    require(isGovernance(msg.sender), '!gov');
    _;
  }

  // *********** GOVERNANCE ACTIONS *****************

  function setPriceCalculator(address newValue) external onlyGov {
    tools[keccak256(abi.encodePacked("calculator"))] = newValue;
    emit ToolAddressUpdated(newValue);
  }

  // *********** MAIN VIEWS *****************

  function priceCalculator() public view returns (address) {
    return tools[keccak256(abi.encodePacked("calculator"))];
  }

  // normalized precision
  function vaultERC2626TvlUsdc(address _vault) public view returns (uint256){
    uint256 underlyingPrice = getPrice(IERC4626(_vault).asset());
    return normalizePrecision(IERC4626(_vault).totalAssets(), IERC4626(_vault).decimals()) * underlyingPrice / PRECISION;
  }

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

  function normalizePrecision(uint256 amount, uint256 decimals) internal pure returns (uint256) {
    if (decimals == 0) {
      return 0;
    }
    return amount.mul(PRECISION).div(10 ** decimals);
  }

}
