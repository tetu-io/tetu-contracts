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

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Controllable.sol";
import "../interface/IFundKeeper.sol";

/// @title Upgradable contract that holds money for further implementations
/// @dev Use with TetuProxy
/// @author belbix
contract FundKeeper is Controllable, IFundKeeper {
  using SafeERC20 for IERC20;

  /// @notice Governance moved token to Controller
  event TokenWithdrawn(address indexed token, uint256 amount);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _controller Controller address
  function initialize(address _controller) external initializer {
    Controllable.initializeControllable(_controller);
  }

  /// @notice Move tokens to controller where money will be protected with time lock
  /// @param _token Token address
  /// @param amount Token amount
  function withdrawToController(address _token, uint256 amount) external override onlyController {
    uint256 tokenBalance = IERC20(_token).balanceOf(address(this));
    require(tokenBalance >= amount, "not enough balance");
    IERC20(_token).safeTransfer(controller(), amount);
    emit TokenWithdrawn(_token, amount);
  }

}
