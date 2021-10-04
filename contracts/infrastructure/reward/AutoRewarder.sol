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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../../base/governance/Controllable.sol";
import "../../base/interface/ISmartVault.sol";
import "../../base/interface/IController.sol";

/// @title Calculate recommended reward amount for vaults and distribute it
/// @author belbix
contract AutoRewarder is Controllable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // *********** CONSTANTS ****************
  string public constant VERSION = "1.0.0";

  // *********** VARIABLES ****************
  uint256 public rewardsPerDay = 1_000_000;

  // *********** EVENTS *******************
  event TokenMoved(address token, uint256 amount);

  constructor(address _controller) {
    Controllable.initializeControllable(_controller);
  }

  // *********** VIEWS ********************
  function psVault() public view returns (address) {
    return IController(controller()).psVault();
  }

  // move tokens to controller where money will be protected with time lock
  function moveTokensToController(address _token, uint256 amount) external onlyControllerOrGovernance {
    uint256 tokenBalance = IERC20(_token).balanceOf(address(this));
    require(tokenBalance >= amount, "NH: Not enough balance");
    IERC20(_token).safeTransfer(controller(), amount);
    emit TokenMoved(_token, amount);
  }


  function notifyVaultWithPsToken(uint256 amount, address vault) internal {
    require(vault != psVault(), "NH: PS forbidden");
    address token = ISmartVault(psVault()).underlying();

    // deposit token to PS
    IERC20(token).safeApprove(psVault(), 0);
    IERC20(token).safeApprove(psVault(), amount);
    ISmartVault(psVault()).deposit(amount);
    uint256 amountToSend = IERC20(psVault()).balanceOf(address(this));

    IERC20(psVault()).safeApprove(vault, 0);
    IERC20(psVault()).safeApprove(vault, amountToSend);
    ISmartVault(vault).notifyTargetRewardAmount(psVault(), amountToSend);
  }

}
