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
import "../../SlotsLib.sol";
import "../../../third_party/curve/IVotingEscrow.sol";
import "../../../third_party/curve/IVotingEscrowDelegation.sol";

/// @title Base contract for BAL stake into veBAL pool
/// @author belbix
abstract contract BalStakingStrategyBase is ProxyStrategyBase {
  using SafeERC20 for IERC20;
  using SlotsLib for bytes32;

  // --------------------- CONSTANTS -------------------------------
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "BalStakingStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev 0% buybacks, all should be done on polygon
  ///      Probably we will change it later
  uint256 private constant _BUY_BACK_RATIO = 0;

  uint256 private constant _MAX_LOCK = 365 * 86400;
  uint256 private constant _WEEK = 7 * 86400;
  bytes32 internal constant _VE_BAL_KEY = bytes32(uint256(keccak256("s.ve_bal")) - 1);
  bytes32 internal constant _DEPOSITOR_KEY = bytes32(uint256(keccak256("s.depositor")) - 1);


  /// @notice Initialize contract after setup it as proxy implementation
  function initializeStrategy(
    address controller_,
    address underlying_,
    address vault_,
    address[] memory rewardTokens_,
    address veBAL_,
    address depositor_
  ) public initializer {
    _VE_BAL_KEY.set(veBAL_);
    _DEPOSITOR_KEY.set(depositor_);
    ProxyStrategyBase.initializeStrategyBase(
      controller_,
      underlying_,
      vault_,
      rewardTokens_,
      _BUY_BACK_RATIO
    );

    IERC20(underlying_).safeApprove(veBAL_, type(uint256).max);
  }


  // --------------------------------------------

  function depositor() external view returns (address){
    return _DEPOSITOR_KEY.getAddress();
  }

  function _veBAL() internal view returns (IVotingEscrow) {
    return IVotingEscrow(_VE_BAL_KEY.getAddress());
  }

  /// @dev Manual withdraw for any emergency purposes
  function manualWithdraw() external restricted {
    _veBAL().withdraw();
    IERC20(_underlying()).safeTransfer(_vault(), IERC20(_underlying()).balanceOf(address(this)));
  }


  // todo delegate

  // --------------------------------------------

  /// @notice Return only pool balance. Assume that we ALWAYS invest on vault deposit action
  function investedUnderlyingBalance() external override view returns (uint) {
    return _rewardPoolBalance();
  }

  /// @dev Returns underlying balance in the pool
  function _rewardPoolBalance() internal override view returns (uint256) {
    (uint amount,) = _veBAL().locked(address(this));
    return amount;
  }

  /// @dev Collect profit and do something useful with them
  function doHardWork() external override {

    // todo claim

    address _depositor = _DEPOSITOR_KEY.getAddress();
    require(msg.sender == _depositor, "Not depositor");
    // transfer all rewards to depositor contract
    // it should be called only from depositor contract for immediately transfer rewards to another chain
    uint length = _rewardTokens.length;
    for (uint i; i < length; ++i) {
      address rt = _rewardTokens[i];
      uint balance = IERC20(rt).balanceOf(address(this));
      if (balance != 0) {
        IERC20(rt).safeTransfer(_depositor, balance);
      }
    }
  }

  /// @dev Stake underlying to the pool with maximum lock period
  function depositToPool(uint256 amount) internal override {
    if (amount > 0) {
      // lock on max period

      (uint balanceLocked, uint unlockTime) = _veBAL().locked(address(this));
      if (unlockTime == 0 && balanceLocked == 0) {
        _veBAL().create_lock(amount, block.timestamp + _MAX_LOCK);
      } else {
        _veBAL().increase_amount(amount);

        uint256 unlockAt = block.timestamp + _MAX_LOCK;
        uint256 unlockInWeeks = (unlockAt / _WEEK) * _WEEK;

        //increase time too if over 2 week buffer
        if (unlockInWeeks > unlockTime && unlockInWeeks - unlockTime > 2) {
          _veBAL().increase_unlock_time(unlockAt);
        }
      }
    }
  }

  /// @dev We will not able to withdraw from the pool
  function withdrawAndClaimFromPool(uint256) internal pure override {
    revert("BSS: Withdraw forbidden");
  }

  /// @dev Curve implementation does not have emergency withdraw
  function emergencyWithdrawFromPool() internal pure override {
    revert("BSS: Withdraw forbidden");
  }

  /// @dev No claimable tokens
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    return toClaim;
  }

  /// @dev Return full amount of staked tokens
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlying()).balanceOf(_VE_BAL_KEY.getAddress());
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.BALANCER;
  }

  function liquidateReward() internal pure override {
    // noop
  }

}
