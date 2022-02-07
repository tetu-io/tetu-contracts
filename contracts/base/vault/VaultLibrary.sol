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

import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/Math.sol";
import "../interface/IStrategy.sol";
import "../interface/IControllable.sol";
import "../interface/IController.sol";
import "../interface/IVaultController.sol";
import "../interface/IBookkeeper.sol";

/// @title Library for SmartVault
/// @author belbix
library VaultLibrary {
  using SafeERC20 for IERC20;

  // !!! CONSTANTS MUST BE THE SAME AS IN SMART VAULT !!!
  uint private constant TO_INVEST_DENOMINATOR = 1000;
  uint private constant LOCK_PENALTY_DENOMINATOR = 1000;

  /// @dev Do necessary checks and prepare a strategy for installing
  function changeStrategy(
    address controller,
    address underlying,
    address newStrategy,
    address oldStrategy
  ) public {
    require(controller == msg.sender, "SV: Not controller");
    require(newStrategy != address(0), "SV: Zero new strategy");
    require(IStrategy(newStrategy).underlying() == address(underlying), "SV: Wrong strategy underlying");
    require(IStrategy(newStrategy).vault() == address(this), "SV: Wrong strategy vault");
    require(IControllable(newStrategy).isController(controller), "SV: Wrong strategy controller");
    require(newStrategy != oldStrategy, "SV: The same strategy");

    if (oldStrategy != address(0)) {// if the original strategy is defined
      IERC20(underlying).safeApprove(address(oldStrategy), 0);
      IStrategy(oldStrategy).withdrawAllToVault();
    }
    IERC20(underlying).safeApprove(newStrategy, 0);
    IERC20(underlying).safeApprove(newStrategy, type(uint).max);
    IController(controller).addStrategy(newStrategy);
  }

  /// @notice Returns amount of the underlying asset ready to invest to the strategy
  function availableToInvestOut(
    address strategy,
    uint toInvest,
    uint underlyingBalanceInVault
  ) public view returns (uint) {
    if (strategy == address(0)) {
      return 0;
    }
    uint wantInvestInTotal = underlyingBalanceWithInvestment(strategy, underlyingBalanceInVault)
    * toInvest / TO_INVEST_DENOMINATOR;
    uint alreadyInvested = IStrategy(strategy).investedUnderlyingBalance();
    if (alreadyInvested >= wantInvestInTotal) {
      return 0;
    } else {
      uint remainingToInvest = wantInvestInTotal - alreadyInvested;
      return remainingToInvest <= underlyingBalanceInVault
      ? remainingToInvest : underlyingBalanceInVault;
    }
  }

  /// @dev It is a part of withdrawing process.
  ///      Do necessary calculation for withdrawing from strategy and move funds to vault
  function processWithdrawFromStrategy(
    uint numberOfShares,
    address underlying,
    uint totalSupply,
    uint toInvest,
    address strategy
  ) public returns (uint) {
    uint underlyingBalanceInVault = IERC20(underlying).balanceOf(address(this));
    uint underlyingAmountToWithdraw =
    underlyingBalanceWithInvestment(strategy, underlyingBalanceInVault)
    * numberOfShares / totalSupply;
    if (underlyingAmountToWithdraw > underlyingBalanceInVault) {
      // withdraw everything from the strategy to accurately check the share value
      if (numberOfShares == totalSupply) {
        IStrategy(strategy).withdrawAllToVault();
      } else {
        uint strategyBalance = IStrategy(strategy).investedUnderlyingBalance();
        // we should always have buffer amount inside the vault
        uint missing = (strategyBalance + underlyingBalanceInVault)
        * (TO_INVEST_DENOMINATOR - toInvest)
        / TO_INVEST_DENOMINATOR
        + underlyingAmountToWithdraw;
        missing = Math.min(missing, strategyBalance);
        if (missing > 0) {
          IStrategy(strategy).withdrawToVault(missing);
        }
      }
      underlyingBalanceInVault = IERC20(underlying).balanceOf(address(this));
      // recalculate to improve accuracy
      underlyingAmountToWithdraw = Math.min(
        underlyingBalanceWithInvestment(strategy, underlyingBalanceInVault)
        * numberOfShares / totalSupply,
        underlyingBalanceInVault
      );
    }
    return underlyingAmountToWithdraw;
  }

  /// @notice Returns the current underlying (e.g., DAI's) balance together with
  ///         the invested amount (if DAI is invested elsewhere by the strategy).
  function underlyingBalanceWithInvestment(
    address strategy,
    uint underlyingBalanceInVault
  ) internal view returns (uint256) {
    if (address(strategy) == address(0)) {
      // initial state, when not set
      return underlyingBalanceInVault;
    }
    return underlyingBalanceInVault + IStrategy(strategy).investedUnderlyingBalance();
  }

  /// @dev Locking logic will add a part of locked shares as rewards for this vault
  ///      Calculate locked amount for using in the main logic
  function calculateLockedAmount(
    uint numberOfShares,
    mapping(address => uint) storage userLockTs,
    uint lockPeriod,
    uint lockPenalty,
    uint userBalance
  ) public returns (uint numberOfSharesAdjusted, uint lockedSharesToReward) {
    numberOfSharesAdjusted = numberOfShares;
    uint lockStart = userLockTs[msg.sender];
    // refresh lock time
    // if full withdraw set timer to 0
    if (userBalance == numberOfSharesAdjusted) {
      userLockTs[msg.sender] = 0;
    } else {
      userLockTs[msg.sender] = block.timestamp;
    }
    if (lockStart != 0 && lockStart < block.timestamp) {
      uint currentLockDuration = block.timestamp - lockStart;
      if (currentLockDuration < lockPeriod) {
        uint sharesBase = numberOfSharesAdjusted
        * (LOCK_PENALTY_DENOMINATOR - lockPenalty)
        / LOCK_PENALTY_DENOMINATOR;
        uint toWithdraw = sharesBase + (
        ((numberOfSharesAdjusted - sharesBase) * currentLockDuration) / lockPeriod
        );
        lockedSharesToReward = numberOfSharesAdjusted - toWithdraw;
        numberOfSharesAdjusted = toWithdraw;
      }
    }
    return (numberOfSharesAdjusted, lockedSharesToReward);
  }

  /// @notice Return amount ready to claim, calculated with actual boost.
  ///         Accurate value returns only after updateRewards call.
  function earnedWithBoost(
    uint reward,
    uint boostStart,
    address controller,
    bool protectionMode
  ) public view returns (uint) {
    // if we don't have a record we assume that it was deposited before boost logic and use 100% boost
    if (boostStart != 0 && boostStart < block.timestamp) {
      uint currentBoostDuration = block.timestamp - boostStart;
      // not 100% boost
      IVaultController _vaultController = IVaultController(IController(controller).vaultController());
      uint boostDuration = _vaultController.rewardBoostDuration();
      uint rewardRatioWithoutBoost = _vaultController.rewardRatioWithoutBoost();
      if (protectionMode) {
        rewardRatioWithoutBoost = 0;
      }
      if (currentBoostDuration < boostDuration) {
        uint rewardWithoutBoost = reward * rewardRatioWithoutBoost / 100;
        // calculate boosted part of rewards
        reward = rewardWithoutBoost + (
        (reward - rewardWithoutBoost) * currentBoostDuration / boostDuration
        );
      }
    }
    return reward;
  }

  /// @notice Transfer earned rewards to caller
  function processPayReward(
    address rt,
    uint reward,
    mapping(address => uint256) storage userBoostTs,
    address controller,
    bool protectionMode,
    mapping(address => mapping(address => uint256)) storage rewardsForToken
  ) public returns (uint renotifiedAmount, uint paidReward) {
    paidReward = reward;
    if (paidReward > 0 && IERC20(rt).balanceOf(address(this)) >= paidReward) {
      // calculate boosted amount
      uint256 boostStart = userBoostTs[msg.sender];
      // refresh boost
      userBoostTs[msg.sender] = block.timestamp;
      // if we don't have a record we assume that it was deposited before boost logic and use 100% boost
      // allow claim without penalty to some addresses, TetuSwap pairs as example
      if (
        boostStart != 0
        && boostStart < block.timestamp
        && !IController(controller).isPoorRewardConsumer(msg.sender)
      ) {
        uint256 currentBoostDuration = block.timestamp - boostStart;
        IVaultController _vaultController = IVaultController(IController(controller).vaultController());
        // not 100% boost
        uint256 boostDuration = _vaultController.rewardBoostDuration();
        uint256 rewardRatioWithoutBoost = _vaultController.rewardRatioWithoutBoost();
        if (protectionMode) {
          rewardRatioWithoutBoost = 0;
        }
        if (currentBoostDuration < boostDuration) {
          uint256 rewardWithoutBoost = paidReward * rewardRatioWithoutBoost / 100;
          // calculate boosted part of rewards
          uint256 toClaim = rewardWithoutBoost + (
          (paidReward - rewardWithoutBoost) * currentBoostDuration / boostDuration
          );
          renotifiedAmount = paidReward - toClaim;
          paidReward = toClaim;
          // notify reward should be called in vault
        }
      }

      rewardsForToken[rt][msg.sender] = 0;
      IERC20(rt).safeTransfer(msg.sender, paidReward);
      // only statistic, should not affect reward claim process
      try IBookkeeper(IController(controller).bookkeeper())
      .registerUserEarned(msg.sender, address(this), rt, paidReward) {
      } catch {}
    }
    return (renotifiedAmount, paidReward);
  }

}
