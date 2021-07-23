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
import "../base/governance/Controllable.sol";
import "../base/interface/ISmartVault.sol";
import "../base/interface/IController.sol";

contract NotifyHelper is Controllable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  string public constant VERSION = "0";

  mapping(address => bool) private alreadyNotified;

  constructor(address _controller) {
    Controllable.initializeControllable(_controller);
  }

  function psVault() public view returns (address) {
    return IController(controller()).psVault();
  }

  function moveFundsToController(address _token) external onlyControllerOrGovernance {
    IERC20(_token).safeTransfer(controller(), IERC20(_token).balanceOf(address(this)));
  }

  function notifyVaults(uint256[] memory amounts, address[] memory vaults, uint256 sum, address token)
  external onlyControllerOrGovernance {
    uint256 tokenBal = IERC20(token).balanceOf(address(this));
    require(sum <= tokenBal, "not enough balance");
    require(amounts.length == vaults.length, "wrong data");

    // clear notified statuses
    for (uint i = 0; i < vaults.length; i++) {
      alreadyNotified[vaults[i]] = false;
    }

    uint256 check = 0;
    for (uint i = 0; i < vaults.length; i++) {
      require(amounts[i] > 0, "Notify zero");
      require(!alreadyNotified[vaults[i]], "Duplicate pool");
      require(IController(controller()).isValidVault(vaults[i]), "Vault not registered");

      if (token == ISmartVault(psVault()).underlying()) {
        notifyVaultWithPsToken(amounts[i], vaults[i]);
      } else {
        notifyVault(amounts[i], vaults[i], token);
      }
      check = check.add(amounts[i]);
    }
    require(sum == check, "Wrong check sum");
  }

  function notifyVault(uint256 amount, address vault, address token) internal {
    IERC20(token).safeApprove(vault, amount);
    ISmartVault(vault).notifyTargetRewardAmount(token, amount);
    alreadyNotified[vault] = true;
  }

  function notifyVaultWithPsToken(uint256 amount, address vault) internal {
    require(vault != psVault(), "ps forbidden");

    address token = ISmartVault(psVault()).underlying();

    // deposit token to PS
    require(token == ISmartVault(psVault()).underlying(), "invalid token");
    IERC20(token).safeApprove(psVault(), amount);
    ISmartVault(psVault()).deposit(amount);
    uint256 amountToSend = IERC20(psVault()).balanceOf(address(this));

    IERC20(psVault()).safeApprove(vault, amountToSend);
    ISmartVault(vault).notifyTargetRewardAmount(psVault(), amountToSend);


    alreadyNotified[vault] = true;
  }
}
