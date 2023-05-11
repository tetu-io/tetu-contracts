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

import "./StrategyBase.sol";
import "../interfaces/ISmartVault.sol";
import "../../third_party/IERC20Extended.sol";
import "./IFoldStrategy.sol";

/// @title Abstract contract for folding strategy
/// @author JasperS13
/// @author belbix
abstract contract FoldingBase is StrategyBase, IFoldStrategy {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @dev Maximum folding loops
  uint256 public constant MAX_DEPTH = 3;
  /// @notice Denominator value for the both above mentioned ratios
  uint256 public _FACTOR_DENOMINATOR = 10000;
  uint256 public _BORROW_FACTOR = 9900;

  /// @notice Numerator value for the targeted borrow rate
  uint256 public override borrowTargetFactorNumeratorStored;
  uint256 public override borrowTargetFactorNumerator;
  /// @notice Numerator value for the asset market collateral value
  uint256 public override collateralFactorNumerator;
  /// @notice Use folding
  bool public override fold = true;
  /// @dev 0 - default mode, 1 - always enable, 2 - always disable
  uint public override foldState;

  /// @notice Strategy balance parameters to be tracked
  uint256 public override suppliedInUnderlying;
  uint256 public override borrowedInUnderlying;

  event FoldStateChanged(uint value);
  event FoldStopped();
  event FoldStarted(uint256 borrowTargetFactorNumerator);
  event MaxDepthReached();
  event NoMoneyForLiquidateUnderlying();
  event UnderlyingLiquidationFailed();
  event Rebalanced(uint256 supplied, uint256 borrowed, uint256 borrowTarget);
  event BorrowTargetFactorNumeratorChanged(uint256 value);
  event CollateralFactorNumeratorChanged(uint256 value);

  modifier updateSupplyInTheEnd() {
    _;
    (suppliedInUnderlying, borrowedInUnderlying) = _getInvestmentData();
  }

  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    uint256 __buyBackRatio,
    uint256 _borrowTargetFactorNumerator,
    uint256 _collateralFactorNumerator
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, __buyBackRatio) {
    require(_collateralFactorNumerator < _FACTOR_DENOMINATOR, "FS: Collateral factor cannot be this high");
    collateralFactorNumerator = _collateralFactorNumerator;

    require(_borrowTargetFactorNumerator == 0 || _borrowTargetFactorNumerator < collateralFactorNumerator, "FS: Target should be lower than collateral limit");
    borrowTargetFactorNumeratorStored = _borrowTargetFactorNumerator;
    borrowTargetFactorNumerator = _borrowTargetFactorNumerator;
  }

  ///////////// internal functions require specific implementation for each platforms

  function _getInvestmentData() internal virtual returns (uint256 supplied, uint256 borrowed);

  function _isFoldingProfitable() internal view virtual returns (bool);

  function _claimReward() internal virtual;

  //////////// require update balance in the end

  function _supply(uint256 amount) internal virtual;

  function _borrow(uint256 amountUnderlying) internal virtual;

  function _redeemUnderlying(uint256 amountUnderlying) internal virtual;

  function _repay(uint256 amountUnderlying) internal virtual;

  function _redeemMaximumWithLoan() internal virtual;

  // ************* VIEW **********************

  /// @dev Return true if we can gain profit with folding
  function isFoldingProfitable() public view override returns (bool) {
    return _isFoldingProfitable();
  }

  function _isAutocompound() internal view virtual returns (bool) {
    return _buyBackRatio != _BUY_BACK_DENOMINATOR;
  }

  // ************* GOV ACTIONS **************

  function claimReward() external hardWorkers {
    _claimReward();
  }

  /// @dev Liquidate rewards and do underlying compound
  function compound() external hardWorkers updateSupplyInTheEnd {
    if (_isAutocompound()) {
      _autocompound();
    } else {
      _compound();
    }
  }

  /// @dev Set folding state
  /// @param _state 0 - default mode, 1 - always enable, 2 - always disable
  function setFold(uint _state) external override restricted {
    require(_state != foldState, "FB: The same folding state");
    if (_state == 0) {
      if (!isFoldingProfitable() && fold) {
        _stopFolding();
      } else if (isFoldingProfitable() && !fold) {
        _startFolding();
      }
    } else if (_state == 1) {
      _startFolding();
    } else if (_state == 2) {
      _stopFolding();
    } else {
      revert("FB: Wrong folding state");
    }
    foldState = _state;
    emit FoldStateChanged(_state);
  }

  /// @dev Rebalances the borrow ratio
  function rebalance() external override hardWorkers {
    _rebalance();
  }

  /// @dev Check fold state and rebalance if needed
  function checkFold() external hardWorkers {
    if (foldState == 0) {
      if (!isFoldingProfitable() && fold) {
        _stopFolding();
      } else if (isFoldingProfitable() && !fold) {
        _startFolding();
      } else {
        _rebalance();
      }
    } else {
      _rebalance();
    }
  }

  /// @dev Set borrow rate target
  function setBorrowTargetFactorNumeratorStored(uint256 _target) external override restricted {
    _setBorrowTargetFactorNumeratorStored(_target);
  }

  function stopFolding() external override restricted {
    _stopFolding();
  }

  function startFolding() external override restricted {
    _startFolding();
  }

  /// @dev Set collateral rate for asset market
  function setCollateralFactorNumerator(uint256 _target) external override restricted {
    require(_target < _FACTOR_DENOMINATOR, "FS: Collateral factor cannot be this high");
    collateralFactorNumerator = _target;
    emit CollateralFactorNumeratorChanged(_target);
  }

  /// @dev Set buy back denominator
  function setBuyBack(uint256 _value) external restricted {
    require(_value <= _BUY_BACK_DENOMINATOR, "FS: Too high");
    _buyBackRatio = _value;
  }

  function manualRedeem(uint amount) external restricted updateSupplyInTheEnd {
    _redeemUnderlying(amount);
  }

  function manualRepay(uint amount) external restricted updateSupplyInTheEnd {
    _repay(amount);
  }

  function manualSupply(uint amount) external restricted updateSupplyInTheEnd {
    _supply(amount);
  }

  function manualBorrow(uint amount) external restricted updateSupplyInTheEnd {
    _borrow(amount);
  }

  /// @dev This function should be used in emergency case when not enough gas for redeem all in one tx
  function manualRedeemMax() external hardWorkers updateSupplyInTheEnd {
    _redeemMaxPossible();
  }

  //////////////////////////////////////////////////////
  //////////// STRATEGY FUNCTIONS IMPLEMENTATIONS //////
  //////////////////////////////////////////////////////

  /// @notice Strategy balance supplied minus borrowed
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256) {
    return suppliedInUnderlying - borrowedInUnderlying;
  }

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork()  external onlyNotPausedInvesting virtual override hardWorkers updateSupplyInTheEnd {
    // don't invest underlying for reduce cas consumption
    _claimReward();
    if (_isAutocompound()) {
      _autocompound();
    } else {
      _compound();
    }
    // supply underlying for avoiding liquidation in case of reward is the same as underlying
    if (underlyingBalance() > 0) {
      _supply(underlyingBalance());
    }
    liquidateReward();
    // don't rebalance, it should be done as separate tx
  }

  /// @dev Withdraw underlying from Iron MasterChef finance
  /// @param amount Withdraw amount
  function withdrawAndClaimFromPool(uint256 amount) internal override updateSupplyInTheEnd {
    // don't claim rewards on withdraw action for reducing gas usage
    //    _claimReward();
    _redeemPartialWithLoan(amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override updateSupplyInTheEnd {
    _redeemMaximumWithLoan();
  }

  /// @dev Should withdraw all available assets
  function exitRewardPool() internal override updateSupplyInTheEnd {
    uint256 bal = rewardPoolBalance();
    if (bal != 0) {
      // _claimReward();
      _redeemMaximumWithLoan();
      // reward liquidation can ruin transaction, do it in hard work process
    }
  }

  //////////////////////////////////////////////////////
  //////////// INTERNAL GOV FUNCTIONS //////////////////
  //////////////////////////////////////////////////////

  /// @dev Rebalances the borrow ratio
  function _rebalance() internal updateSupplyInTheEnd {
    (uint256 supplied, uint256 borrowed) = _getInvestmentData();
    uint256 borrowTarget = _borrowTarget();
    if (borrowed > borrowTarget) {
      _redeemPartialWithLoan(0);
    } else if (borrowed < borrowTarget) {
      depositToPool(0);
    }
    emit Rebalanced(supplied, borrowed, borrowTarget);
  }

  /// @dev Set borrow rate target
  function _setBorrowTargetFactorNumeratorStored(uint256 _target) internal {
    require(_target == 0 || _target < collateralFactorNumerator, "FS: Target should be lower than collateral limit");
    borrowTargetFactorNumeratorStored = _target;
    if (fold) {
      borrowTargetFactorNumerator = _target;
    }
    emit BorrowTargetFactorNumeratorChanged(_target);
  }

  function _stopFolding() internal {
    borrowTargetFactorNumerator = 0;
    fold = false;
    _rebalance();
    emit FoldStopped();
  }

  function _startFolding() internal {
    borrowTargetFactorNumerator = borrowTargetFactorNumeratorStored;
    fold = true;
    _rebalance();
    emit FoldStarted(borrowTargetFactorNumeratorStored);
  }

  //////////////////////////////////////////////////////
  //////////// FOLDING LOGIC FUNCTIONS /////////////////
  //////////////////////////////////////////////////////

  function _maxRedeem() internal returns (uint){
    (uint supplied, uint borrowed) = _getInvestmentData();
    if (collateralFactorNumerator == 0) {
      return supplied;
    }
    uint256 requiredCollateral = borrowed * _FACTOR_DENOMINATOR / collateralFactorNumerator;
    if (supplied < requiredCollateral) {
      return 0;
    }
    return supplied - requiredCollateral;
  }

  function _borrowTarget() internal returns (uint256) {
    (uint256 supplied, uint256 borrowed) = _getInvestmentData();
    uint256 balance = supplied - borrowed;
    return balance * borrowTargetFactorNumerator
    / (_FACTOR_DENOMINATOR - borrowTargetFactorNumerator);
  }

  /// @dev Deposit underlying to rToken contract
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override updateSupplyInTheEnd {
    if (amount > 0) {
      _supply(amount);
      if (!_isAutocompound()) {
        // we need to sell excess in non hardWork function for keeping ppfs ~1
        _liquidateExcessUnderlying();
      }
    }
    if (foldState == 2 || !fold) {
      return;
    }
    (uint256 supplied, uint256 borrowed) = _getInvestmentData();
    uint256 borrowTarget = _borrowTarget();
    uint256 i = 0;
    while (borrowed < borrowTarget) {
      uint256 wantBorrow = borrowTarget - borrowed;
      uint256 maxBorrow = (supplied * collateralFactorNumerator / _FACTOR_DENOMINATOR) - borrowed;
      // need to reduce max borrow for keep a gap for negative balance fluctuation
      maxBorrow = maxBorrow * _BORROW_FACTOR / _FACTOR_DENOMINATOR;
      _borrow(Math.min(wantBorrow, maxBorrow));
      uint256 _underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
      if (_underlyingBalance > 0) {
        _supply(_underlyingBalance);
      }
      // need to update local balances
      (supplied, borrowed) = _getInvestmentData();

      // we can move the market and make folding unprofitable
      if (!_isFoldingProfitable()) {
        // rollback the last action
        _redeemUnderlying(_underlyingBalance);
        _underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
        _repay(_underlyingBalance);
        break;
      }

      i++;
      if (i == MAX_DEPTH) {
        emit MaxDepthReached();
        break;
      }
    }
  }

  /// @dev Redeems a set amount of underlying tokens while keeping the borrow ratio healthy.
  ///      This function must not revert transaction
  function _redeemPartialWithLoan(uint256 amount) internal updateSupplyInTheEnd {
    (uint256 supplied, uint256 borrowed) = _getInvestmentData();
    uint256 oldBalance = supplied - borrowed;
    uint256 newBalance = 0;
    if (amount < oldBalance) {
      newBalance = oldBalance - amount;
    }
    uint256 newBorrowTarget = newBalance * borrowTargetFactorNumerator / (_FACTOR_DENOMINATOR - borrowTargetFactorNumerator);
    uint256 _underlyingBalance = 0;
    uint256 i = 0;
    while (borrowed > newBorrowTarget) {
      uint256 requiredCollateral = borrowed * _FACTOR_DENOMINATOR / collateralFactorNumerator;
      uint256 toRepay = borrowed - newBorrowTarget;
      if (supplied < requiredCollateral) {
        break;
      }
      // redeem just as much as needed to repay the loan
      // supplied - requiredCollateral = max redeemable, amount + repay = needed
      uint256 toRedeem = Math.min(supplied - requiredCollateral, amount + toRepay);
      _redeemUnderlying(toRedeem);
      // now we can repay our borrowed amount
      _underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
      toRepay = Math.min(toRepay, _underlyingBalance);
      if (toRepay == 0) {
        // in case of we don't have money for repaying we can't do anything
        break;
      }
      _repay(toRepay);
      // update the parameters
      (supplied, borrowed) = _getInvestmentData();
      i++;
      // don't check MAX_DEPTH
      // we should able to withdraw as much as possible
    }
    _underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
    if (_underlyingBalance < amount) {
      uint toRedeem = amount - _underlyingBalance;
      if (toRedeem != 0) {
        // redeem the most we can redeem
        _redeemUnderlying(toRedeem);
      }
    }
    // supply excess underlying balance in the end
    _underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
    if (_underlyingBalance > amount) {
      _supply(_underlyingBalance - amount);
    }
  }

  function _redeemMaxPossible() internal updateSupplyInTheEnd {
    // assume that _maxRedeem() will be called inside _redeemUnderlying()
    _redeemUnderlying(type(uint256).max);
    (,uint borrowed) = _getInvestmentData();
    uint toRepay = Math.min(borrowed, IERC20(_underlyingToken).balanceOf(address(this)));
    _repay(toRepay);
  }

  //////////////////////////////////////////////////////
  ///////////////// LIQUIDATION ////////////////////////
  //////////////////////////////////////////////////////

  function _autocompound() internal {
    require(_isAutocompound(), "FB: Must use compound");
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      uint256 amount = rewardBalance(i);
      address rt = _rewardTokens[i];
      // a little threshold
      if (amount > 1000) {
        uint toDistribute = amount * _buyBackRatio / _BUY_BACK_DENOMINATOR;
        uint toCompound = amount - toDistribute;
        address forwarder = IController(controller()).feeRewardForwarder();
        IERC20(rt).safeApprove(forwarder, 0);
        IERC20(rt).safeApprove(forwarder, amount);
        IFeeRewardForwarder(forwarder).liquidate(rt, _underlyingToken, toCompound);
        try IFeeRewardForwarder(forwarder).distribute(toDistribute, _underlyingToken, _smartVault)
        returns (uint256 targetTokenEarned) {
          if (targetTokenEarned > 0) {
            IBookkeeper(IController(controller()).bookkeeper()).registerStrategyEarned(targetTokenEarned);
          }
        } catch {
          emit UnderlyingLiquidationFailed();
        }
      }
    }

  }

  function _compound() internal {
    require(!_isAutocompound(), "FB: Must use autocompound");
    (suppliedInUnderlying, borrowedInUnderlying) = _getInvestmentData();
    uint256 ppfs = ISmartVault(_smartVault).getPricePerFullShare();
    uint256 ppfsPeg = ISmartVault(_smartVault).underlyingUnit();

    // in case of negative ppfs compound all profit to underlying
    if (ppfs < ppfsPeg) {
      for (uint256 i = 0; i < _rewardTokens.length; i++) {
        uint256 amount = rewardBalance(i);
        address rt = _rewardTokens[i];
        // it will sell reward token to Target Token and send back
        if (amount != 0) {
          address forwarder = IController(controller()).feeRewardForwarder();
          IERC20(rt).safeApprove(forwarder, 0);
          IERC20(rt).safeApprove(forwarder, amount);
          uint256 underlyingProfit = IFeeRewardForwarder(forwarder).liquidate(rt, _underlyingToken, amount);
          // supply profit for correct ppfs calculation
          if (underlyingProfit != 0) {
            _supply(underlyingProfit);
          }
        }
      }
    }
    _liquidateExcessUnderlying();
  }

  /// @dev We should keep PPFS ~1
  ///      This function must not ruin transaction
  function _liquidateExcessUnderlying() internal updateSupplyInTheEnd {
    // update balances for accurate ppfs calculation
    (suppliedInUnderlying, borrowedInUnderlying) = _getInvestmentData();

    address forwarder = IController(controller()).feeRewardForwarder();
    uint256 ppfs = ISmartVault(_smartVault).getPricePerFullShare();
    uint256 ppfsPeg = ISmartVault(_smartVault).underlyingUnit();

    if (ppfs > ppfsPeg) {
      uint256 totalUnderlyingBalance = ISmartVault(_smartVault).underlyingBalanceWithInvestment();
      if (totalUnderlyingBalance == 0
      || IERC20Extended(_smartVault).totalSupply() == 0
      || totalUnderlyingBalance < IERC20Extended(_smartVault).totalSupply()
        || totalUnderlyingBalance - IERC20Extended(_smartVault).totalSupply() < 2) {
        // no actions in case of no money
        emit NoMoneyForLiquidateUnderlying();
        return;
      }
      // ppfs = 1 if underlying balance = total supply
      // -1 for avoiding problem with rounding
      uint256 toLiquidate = (totalUnderlyingBalance - IERC20Extended(_smartVault).totalSupply()) - 1;
      if (underlyingBalance() < toLiquidate) {
        _redeemPartialWithLoan(toLiquidate);
      }
      toLiquidate = Math.min(underlyingBalance(), toLiquidate);
      if (toLiquidate != 0) {
        IERC20(_underlyingToken).safeApprove(forwarder, 0);
        IERC20(_underlyingToken).safeApprove(forwarder, toLiquidate);

        // it will sell reward token to Target Token and distribute it to SmartVault and PS
        // we must not ruin transaction in any case
        //slither-disable-next-line unused-return,variable-scope,uninitialized-local
        try IFeeRewardForwarder(forwarder).distribute(toLiquidate, _underlyingToken, _smartVault)
        returns (uint256 targetTokenEarned) {
          if (targetTokenEarned > 0) {
            IBookkeeper(IController(controller()).bookkeeper()).registerStrategyEarned(targetTokenEarned);
          }
        } catch {
          emit UnderlyingLiquidationFailed();
        }
      }
    }
  }

  receive() external payable {} // this is needed for the native token unwrapping
}
