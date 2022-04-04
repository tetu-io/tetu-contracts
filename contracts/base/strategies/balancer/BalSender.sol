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

import "../../governance/ControllableV2.sol";
import "../../../openzeppelin/SafeERC20.sol";
import "../../../openzeppelin/IERC20.sol";
import "../../../third_party/polygon/IChildERC20.sol";
import "../../../third_party/balancer/IBVault.sol";

/// @title Dedicated contract for burn tokens on Polygon as a bridging process
/// @author belbix
contract BalSender is ControllableV2 {
  using SafeERC20 for IERC20;

  // ----- CONSTANTS -------

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  address public constant WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
  address public constant BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;
  address public constant BAL_ETH_POOL = 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f;
  bytes32 public constant BAL_ETH_POOL_ID = 0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f000200000000000000000426;
  address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

  // ----- VARIABLES -----

  IAsset[] private _assets;

  // ----- EVENTS -------

  event Withdrew(uint bptAmount, uint balAmount, uint wethAmount);

  // ----- INITIALIZER -------

  function initialize(
    address controller_
  ) external initializer {
    ControllableV2.initializeControllable(controller_);

    _assets.push(IAsset(WETH));
    _assets.push(IAsset(BAL));
  }

  modifier onlyHardworkerOrGov() {
    require(IController(_controller()).isHardWorker(msg.sender)
      || _isGovernance(msg.sender), "Not hardworker or gov");
    _;
  }

  // ----- GOV ACTIONS -------



  // ----- HARDWORKER ACTIONS -------

  function withdrawAll() external onlyHardworkerOrGov {
    uint bptBalance = IERC20(BAL_ETH_POOL).balanceOf(address(this));

    if (bptBalance == 0) {
      // no actions
      return;
    }
    // empty array, no checking slippage
    uint[] memory minAmountsOut = new uint[](2);
    bytes memory userData = abi.encode(1, bptBalance);

    IERC20(BAL_ETH_POOL).safeApprove(BALANCER_VAULT, 0);
    IERC20(BAL_ETH_POOL).safeApprove(BALANCER_VAULT, bptBalance);

    IBVault(BALANCER_VAULT).exitPool(
      BAL_ETH_POOL_ID,
      address(this),
      payable(address(this)),
      IBVault.ExitPoolRequest(
        _assets,
        minAmountsOut,
        userData,
        false
      )
    );


    uint wethBalance = IERC20(WETH).balanceOf(address(this));
    uint balBalance = IERC20(BAL).balanceOf(address(this));
    if (wethBalance != 0) {
      IChildERC20(WETH).withdraw(wethBalance);
    }
    if (balBalance != 0) {
      IChildERC20(BAL).withdraw(balBalance);
    }

    emit Withdrew(bptBalance, balBalance, wethBalance);
  }


}
