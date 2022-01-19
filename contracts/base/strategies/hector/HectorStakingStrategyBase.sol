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

import "../StrategyBase.sol";
import "../../../third_party/hector/IHectorStaking.sol";
import "../../../third_party/IERC20Extended.sol";

/// @title Base contract for Hector stake pool farming
/// @author iamkosyak
abstract contract HectorStakingStrategyBase is StrategyBase {
  using SafeERC20 for IERC20;

  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "HectorStakingStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;

  address public hectorStaking;
  address public sHEC;
  uint private _balanceSnapshot;

  event NoMoneyForLiquidateUnderlying();
  event UnderlyingLiquidationFailed();

  /// @notice Contract constructor
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _hectorStaking
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(IHectorStaking(_hectorStaking).HEC() == _underlying, "Wrong underlying");

    hectorStaking = _hectorStaking;
    sHEC = IHectorStaking(hectorStaking).sHEC();
  }

  modifier updateBalance() {
    // do not update balance before function call
    // some logic, such as deposit, requires not updated balance
    _;
    // assume that we will able to unstake sHEC to HEC with 1:1 ratio
    _balanceSnapshot = IERC20(sHEC).balanceOf(address(this));
  }

  /// @dev Returns HEC amount under control
  function rewardPoolBalance() public override view returns (uint256 bal) {
    bal = _balanceSnapshot;
  }

  /// @dev Collect profit and do something useful with them
  function doHardWork() external onlyNotPausedInvesting override restricted {
    investAllUnderlying();
    IHectorStaking(hectorStaking).rebase();
    _liquidateExcessUnderlying();
  }

  /// @dev Stake HEC to HectorStaking and receive sHEC
  function depositToPool(uint256 amount) internal override updateBalance {
    if (amount > 0) {
      IERC20(_underlyingToken).safeApprove(hectorStaking, 0);
      IERC20(_underlyingToken).safeApprove(hectorStaking, amount);
      IHectorStaking(hectorStaking).stake(amount, address(this));
      IHectorStaking(hectorStaking).claim(address(this));
    }
    // need to keep PPFS on ~1 for any deposit/withdraw action
    // for deposits need to liquidate excess after stake action
    IHectorStaking(hectorStaking).rebase();
    // for this strategy we should revert transaction if we can't liquidate excess
    // otherwise PPFS can be updated after rebalance and stay higher than 1
    _liquidateExcessUnderlying();
  }

  /// @dev Withdraw staked tokens from HectorStaking
  function withdrawAndClaimFromPool(uint256 amount) internal override updateBalance {
    // need to keep PPFS on ~1 for any deposit/withdraw action
    // for withdrawing need to liquidate before rebalance action
    IHectorStaking(hectorStaking).rebase();
    // for this strategy we should revert transaction if we can't liquidate excess
    // otherwise PPFS can be updated after rebalance and stay higher than 1
    _liquidateExcessUnderlying();

    IERC20(sHEC).safeApprove(hectorStaking, 0);
    IERC20(sHEC).safeApprove(hectorStaking, amount);
    IHectorStaking(hectorStaking).unstake(amount, false);
  }

  /// @dev Withdraw staked tokens from HectorStaking without rebase
  function emergencyWithdrawFromPool() internal override updateBalance {
    uint balance = IERC20(sHEC).balanceOf(address(this));
    if (balance > 0) {
      IHectorStaking(hectorStaking).unstake(balance, false);
    }
  }

  /// @dev Noop
  function liquidateReward() internal override updateBalance {
    // noop
  }

  /// @dev No claimable tokens
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    return toClaim;
  }

  /// @dev Return full amount of staked HEC
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(hectorStaking);
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.HECTOR;
  }

  /// @dev We should keep PPFS ~1
  ///      This function must not ruin transaction
  function _liquidateExcessUnderlying() internal updateBalance {
    // update balance for make sure that we will count PPFS correctly
    _balanceSnapshot = IERC20(sHEC).balanceOf(address(this));
    address forwarder = IController(controller()).feeRewardForwarder();
    uint256 ppfs = ISmartVault(_smartVault).getPricePerFullShare();
    uint256 ppfsPeg = ISmartVault(_smartVault).underlyingUnit();
    if (ppfs > ppfsPeg) {
      uint vaultTotalSupply = IERC20Extended(_smartVault).totalSupply();
      uint256 totalUnderlyingBalance = ISmartVault(_smartVault).underlyingBalanceWithInvestment();
      if (totalUnderlyingBalance == 0
      || vaultTotalSupply == 0
      || totalUnderlyingBalance < vaultTotalSupply
        || totalUnderlyingBalance - vaultTotalSupply < 2) {
        // no actions in case of no money
        emit NoMoneyForLiquidateUnderlying();
        return;
      }
      // ppfs = 1 if underlying balance = total supply
      // -1 for avoiding problem with rounding
      uint256 toLiquidate = (totalUnderlyingBalance - vaultTotalSupply) - 1;
      if (underlyingBalance() < toLiquidate) {
        uint amount = toLiquidate - underlyingBalance();
        IERC20(sHEC).safeApprove(hectorStaking, 0);
        IERC20(sHEC).safeApprove(hectorStaking, amount);
        IHectorStaking(hectorStaking).unstake(amount, false);
      }
      toLiquidate = Math.min(underlyingBalance(), toLiquidate);
      if (toLiquidate != 0) {
        IERC20(_underlyingToken).safeApprove(forwarder, 0);
        IERC20(_underlyingToken).safeApprove(forwarder, toLiquidate);

        uint256 targetTokenEarned = IFeeRewardForwarder(forwarder).distribute(toLiquidate, _underlyingToken, _smartVault);
        if (targetTokenEarned > 0) {
          IBookkeeper(IController(controller()).bookkeeper()).registerStrategyEarned(targetTokenEarned);
        }

      }
    }
  }

  /// @dev Hector asset too fluctuated and difference between share and underlying can be a huge
  function toleranceNominator() internal pure override returns (uint){
    return 0;
  }

}
