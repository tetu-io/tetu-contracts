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


import "./ControllableV2.sol";
import "../interface/IFundKeeper.sol";
import "../interface/ISmartVault.sol";
import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/SafeERC20.sol";

/// @title Upgradable contract that holds money for further implementations
/// @dev Use with TetuProxy
/// @author belbix
contract FundKeeper is ControllableV2, IFundKeeper {
  using SafeERC20 for IERC20;

  // -------- CONSTANTS ------------

  uint public constant DEPOSIT_TIME_LOCK = 18 hours;

  // -------- VARIABLES ------------

  mapping(address => uint) public depositTimeLocks;

  // -------- EVENTS ------------

  /// @notice Governance moved token to Controller
  event TokenWithdrawn(address indexed token, uint256 amount);
  event DepositToVaultAnnounced(address vault);
  event DepositedToVault(address vault, uint amount);
  event WithdrewFromVault(address vault, uint numberOfShares);

  // -------- INIT ------------

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _controller Controller address
  function initialize(address _controller) external initializer {
    ControllableV2.initializeControllable(_controller);
  }

  // -------- RESTRICTIONS ------------

  /// @dev Allow operation only for Controller
  modifier onlyController() {
    require(_controller() == msg.sender, "Not controller");
    _;
  }

  /// @dev Allow operation only for governance
  modifier onlyGov() {
    require(_isGovernance(msg.sender), "Not gov");
    _;
  }

  // -------- MAIN LOGIC ------------

  /// @notice Move tokens to controller where money will be protected with time lock
  /// @param _token Token address
  /// @param amount Token amount
  function withdrawToController(address _token, uint256 amount) external override onlyController {
    uint256 tokenBalance = IERC20(_token).balanceOf(address(this));
    require(tokenBalance >= amount, "not enough balance");
    IERC20(_token).safeTransfer(_controller(), amount);
    emit TokenWithdrawn(_token, amount);
  }

  function announceVaultDeposit(address vault) external onlyGov {
    require(depositTimeLocks[vault] == 0, "announced");
    depositTimeLocks[vault] = block.timestamp + DEPOSIT_TIME_LOCK;
    emit DepositToVaultAnnounced(vault);
  }

  function depositToVault(address vault, uint amount) external onlyGov {
    require(IController(_controller()).isValidVault(vault), "!vault");
    require(depositTimeLocks[vault] != 0 && depositTimeLocks[vault] < block.timestamp, "time lock");

    depositTimeLocks[vault] = 0;

    address underlying = ISmartVault(vault).underlying();
    IERC20(underlying).safeApprove(vault, amount);
    ISmartVault(vault).depositAndInvest(amount);
    emit DepositedToVault(vault, amount);
  }

  function withdrawFromVault(address vault, uint numberOfShares) external onlyGov {
    require(IController(_controller()).isValidVault(vault), "!vault");
    ISmartVault(vault).withdraw(numberOfShares);
    emit WithdrewFromVault(vault, numberOfShares);
  }

}
