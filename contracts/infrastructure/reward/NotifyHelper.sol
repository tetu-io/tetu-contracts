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

import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/SafeMath.sol";
import "../../base/governance/Controllable.sol";
import "../../base/interfaces/ISmartVault.sol";
import "../../base/interfaces/IController.sol";

/// @title Disperse weekly rewards to vaults
/// @author belbix
contract NotifyHelper is Controllable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  string public constant VERSION = "1.3.1";

  mapping(address => bool) public alreadyNotified;
  address[] public alreadyNotifiedList;
  address public dxTetu;

  event TokenMoved(address token, uint256 amount);

  constructor(address _controller) {
    Controllable.initializeControllable(_controller);
  }

  function psVault() public view returns (address) {
    return IController(controller()).psVault();
  }

  function alreadyNotifiedListLength() external view returns (uint256) {
    return alreadyNotifiedList.length;
  }

  // move tokens to controller where money will be protected with time lock
  function moveTokensToController(address _token, uint256 amount) external onlyControllerOrGovernance {
    uint256 tokenBalance = IERC20(_token).balanceOf(address(this));
    require(tokenBalance >= amount, "NH: Not enough balance");
    IERC20(_token).safeTransfer(controller(), amount);
    emit TokenMoved(_token, amount);
  }

  function notifyVaults(uint256[] memory amounts, address[] memory vaults, uint256 sum, address token)
  external onlyControllerOrGovernance {
    uint256 tokenBal = IERC20(token).balanceOf(address(this));
    require(sum <= tokenBal, "NH: Not enough balance");
    require(amounts.length == vaults.length, "wrong data");

    uint256 check = 0;
    for (uint i = 0; i < vaults.length; i++) {
      require(amounts[i] > 0, "NH: Notify zero");
      require(!alreadyNotified[vaults[i]], "NH: Duplicate pool");
      require(IController(controller()).isValidVault(vaults[i]), "NH: Vault not registered");
      address[] memory rts = ISmartVault(vaults[i]).rewardTokens();
      require(rts.length != 0, "NH: No rewards");

      // we need specific logic for dxTETU because locked assets can't be transferred easy
      if (vaults[i] == dxTetu && token == ISmartVault(psVault()).underlying()) {
        notifyVaultWithDXTetu(amounts[i]);
      } else if (token == ISmartVault(psVault()).underlying() && rts[0] == psVault()) {
        notifyVaultWithPsToken(amounts[i], vaults[i]);
      } else {
        notifyVault(amounts[i], vaults[i], token);
      }

      alreadyNotified[vaults[i]] = true;
      alreadyNotifiedList.push(vaults[i]);

      check = check.add(amounts[i]);
    }
    require(sum == check, "NH: Wrong check sum");
  }

  function notifyVault(uint256 amount, address vault, address token) internal {
    IERC20(token).safeApprove(vault, 0);
    IERC20(token).safeApprove(vault, amount);
    ISmartVault(vault).notifyTargetRewardAmount(token, amount);
  }

  function notifyVaultWithPsToken(uint256 amount, address vault) internal {
    require(psVault() != address(0), "NH: Zero xTETU");
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

  function notifyVaultWithDXTetu(uint256 amount) internal {
    require(dxTetu != address(0), "NH: Zero dxTETU");
    // deposit TETU to xTETU
    address token = ISmartVault(psVault()).underlying();
    IERC20(token).safeApprove(psVault(), 0);
    IERC20(token).safeApprove(psVault(), amount);
    ISmartVault(psVault()).deposit(amount);
    uint256 xTetuAmount = IERC20(psVault()).balanceOf(address(this));

    // deposit xTETU to dxTETU vault
    IERC20(psVault()).safeApprove(dxTetu, 0);
    IERC20(psVault()).safeApprove(dxTetu, xTetuAmount);
    ISmartVault(dxTetu).deposit(xTetuAmount);
    uint256 amountToSend = IERC20(dxTetu).balanceOf(address(this));

    IERC20(dxTetu).safeApprove(dxTetu, 0);
    IERC20(dxTetu).safeApprove(dxTetu, amountToSend);
    ISmartVault(dxTetu).notifyTargetRewardAmount(dxTetu, amountToSend);
  }

  /// @notice Clear statuses. Need to use after full cycle of reward distribution
  function clearNotifiedStatuses() external onlyControllerOrGovernance {
    for (uint256 i = alreadyNotifiedList.length; i > 0; i--) {
      delete alreadyNotified[alreadyNotifiedList[i - 1]];
      delete alreadyNotifiedList[i - 1];
      alreadyNotifiedList.pop();
    }
  }

  function setDXTetu(address _value) external onlyControllerOrGovernance {
    dxTetu = _value;
  }
}
