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

import "../base/governance/ControllableV2.sol";
import "../openzeppelin/SafeERC20.sol";
import "../third_party/polygon/IChildERC20.sol";

/// @title Dedicated contract for burn tokens on Polygon as a bridging process
///        Thi contract needs for excluding any EOA during bridge process.
/// @author belbix
contract PolygonBridgeSender is ControllableV2 {
  using SafeERC20 for IERC20;

  // ----- CONSTANTS -------

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";

  // ----- EVENTS -------

  event Bridged(address token, uint amount);

  // ----- INITIALIZER -------

  function initialize(address controller_) external initializer {
    initializeControllable(controller_);
  }

  modifier onlyHardworkerOrGov() {
    require(IController(_controller()).isHardWorker(msg.sender) || _isGovernance(msg.sender), "forbidden");
    _;
  }

  // ----- BRIDGE -------

  function bridge(address token) external onlyHardworkerOrGov {
    uint amount = IERC20(token).balanceOf(address(this));
    IChildERC20(token).withdraw(amount);
    emit Bridged(token, amount);
  }


}
