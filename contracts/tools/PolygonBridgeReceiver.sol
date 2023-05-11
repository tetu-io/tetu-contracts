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
import "../third_party/uniswap/IWETH.sol";
import "../third_party/polygon/IRootChainManager.sol";

/// @title Dedicated contract for receive tokens on mainnet side.
///        Must have the same address as PolygonBridgeSender.
///        Thi contract needs for excluding any EOA during bridge process.
/// @author belbix
contract PolygonBridgeReceiver is ControllableV2 {
  using SafeERC20 for IERC20;

  // ----- CONSTANTS -------

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.1";
  address public constant POLYGON_BRIDGE = 0xA0c68C638235ee32657e8f720a23ceC1bFc77C77;
  address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

  // ----- EVENTS -------

  event Received(address token, uint amount);
  event EthReceived(address sender, uint amount);

  // ----- INITIALIZER -------

  function initialize(address controller_) external initializer {
    initializeControllable(controller_);
  }

  modifier onlyGov() {
    require(_isGovernance(msg.sender), "forbidden");
    _;
  }

  // ----- BRIDGE -------

  function receiveToken(address token, address recipient, bytes calldata bridgeData) external onlyGov {

    IRootChainManager(POLYGON_BRIDGE).exit(bridgeData);

    if (address(this).balance != 0) {
      IWETH(WETH).deposit{value : address(this).balance}();
    }

    uint balance = IERC20(token).balanceOf(address(this));

    IERC20(token).safeTransfer(recipient, balance);

    emit Received(token, balance);
  }

  receive() external payable {
    emit EthReceived(msg.sender, msg.value);
  }
}
