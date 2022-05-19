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

import "../ProxyStrategyBase.sol";
import "../../../third_party/IERC20Extended.sol";
import "../../../third_party/IDelegation.sol";
import "../../../third_party/mesh/IVotingMesh.sol";
import "../../../third_party/mesh/IPoolVoting.sol";

/// @title Base contract for Mesh stake into vMesh pool
/// @author olegn
abstract contract MeshStakingStrategyBase is ProxyStrategyBase {
  using SafeERC20 for IERC20;

  // --------------------- CONSTANTS -------------------------------
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "MeshStakingStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev 10% buybacks, 90% of vested Mesh should go to the vault rewards (not autocompound)
  uint256 private constant _BUY_BACK_RATIO = 10_00;
  uint256 private constant _MAX_LOCK_PERIOD = 1555200000;
  uint256 private constant _MESH_PRECISION = 1e18;
  IVotingMesh public constant vMesh = IVotingMesh(0x176b29289f66236c65C7ac5DB2400abB5955Df13);
  IPoolVoting public constant poolVoting = IPoolVoting(0x705b40Af8CeCd59406cF630Ab7750055c9b137B9);

  // ------------------- VARIABLES ---------------------------------
  // should be only maps/arrays, or use storage contract
  mapping(bytes32 => uint) private strategyUintStorage;
  /// @notice Initialize contract after setup it as proxy implementation
  function initializeStrategy(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens
  ) public initializer {
    ProxyStrategyBase.initializeStrategyBase(
      _controller,
      _underlying,
      _vault,
      __rewardTokens,
      _BUY_BACK_RATIO
    );
  }

  event VotingAdded(address exchange, uint256 amount);
  event VotingRemoved(address exchange, uint256 amount);

  // ------------------ GOV actions --------------------------

  /// @dev Manual withdraw for any emergency purposes
  function manualWithdraw() external restricted {
    IERC20(_underlying()).safeTransfer(_vault(), IERC20(_underlying()).balanceOf(address(this)));
  }

  function addVoting(address exchange, uint256 amount) external restricted {
    require(exchange != address(0), "Exchange address should be specified");
    poolVoting.addVoting(exchange, amount);
    emit VotingAdded(exchange, amount);
  }

  function removeVoting(address exchange, uint256 amount) external restricted {
    require(exchange != address(0), "Exchange address should be specified");
    poolVoting.removeVoting(exchange, amount);
    emit VotingRemoved(exchange, amount);
  }

  // --------------------------------------------

  /// @notice Return only pool balance. Assume that we ALWAYS invest on vault deposit action
  function investedUnderlyingBalance() external override view returns (uint) {
    return _rewardPoolBalance();
  }

  /// @dev Returns MESH amount under control
  function _rewardPoolBalance() internal override view returns (uint256) {
    return vMesh.lockedMESH(address(this));
  }

  /// @dev In this version rewards are accumulated in this strategy
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    vMesh.claimReward();
  }

  /// @dev Stake Mesh to vMesh
  function depositToPool(uint256 amount) internal override {
    if (amount > _MESH_PRECISION) {
      // lock on max period
      // mesh allows only integer values w/o precision e.g 1 mesh token
      amount = amount / _MESH_PRECISION; // rounding
      IERC20(_underlying()).safeApprove(address(vMesh), 0);
      IERC20(_underlying()).safeApprove(address(vMesh), amount * _MESH_PRECISION);
      vMesh.lockMESH(amount, _MAX_LOCK_PERIOD);
    }
  }

  /// @dev Not supported by MESH
  function withdrawAndClaimFromPool(uint256) internal pure override {
    revert("MSS: Withdraw forbidden");
  }

  /// @dev Not supported by MESH
  function emergencyWithdrawFromPool() internal pure override {
    revert("MSS: Method not supported");
  }

  /// @dev In this version MESH rewards are not liquidated.
  function liquidateReward() internal override {}

  /// @dev No claimable tokens
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    return toClaim;
  }

  /// @dev Return full amount of staked tokens
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlying()).balanceOf(address(vMesh));
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.MESH;
  }
}
