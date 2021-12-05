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
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Pipe.sol";
import "./../../../../third_party/qidao/IErc20Stablecoin.sol";
import "../../../interface/IMaiStablecoinPipe.sol";


/// @title Mai Stablecoin Pipe Contract
/// @author bogdoslav
contract MaiStablecoinPipe is Pipe, IMaiStablecoinPipe {
  using SafeERC20 for IERC20;

  struct MaiStablecoinPipeData {
    address sourceToken;
    address stablecoin; //Erc20Stablecoin contract address
    // borrowing
    address borrowToken; // mai (miMATIC) for example
    uint256 targetPercentage; // Collateral to Debt percentage
    uint256 maxImbalance;     // Maximum Imbalance in percents
    address rewardToken;
  }

  MaiStablecoinPipeData public pipeData;
  IErc20Stablecoin private _stablecoin;
  uint256 private vaultID;

  constructor(MaiStablecoinPipeData memory _d) Pipe(
    'MaiStablecoinPipe',
    _d.sourceToken,
    _d.borrowToken
  ) {
    require(_d.stablecoin != address(0), "Zero stablecoin");
    require(_d.rewardToken != address(0), "Zero reward token");

    pipeData = _d;
    rewardTokens.push(_d.rewardToken);
    _stablecoin = IErc20Stablecoin(pipeData.stablecoin);
    vaultID = IErc20Stablecoin(pipeData.stablecoin).createVault();
  }

  /// @dev Sets targetPercentage
  /// @param _targetPercentage - target collateral to debt percentage
  function setTargetPercentage(uint256 _targetPercentage) onlyPipeline override external {
    pipeData.targetPercentage = _targetPercentage;
  }

  /// @dev Gets targetPercentage
  /// @return collateral to debt percentage
  function targetPercentage() external view override returns (uint256) {
    return pipeData.targetPercentage;
  }

  /// @dev function for depositing to collateral then borrowing
  /// @param amount in source units
  /// @return output in underlying units
  function put(uint256 amount) override onlyPipeline external returns (uint256 output) {
    depositCollateral(amount);
    uint256 borrowAmount = _collateralToBorrowTokenAmount(amount);
    borrow(borrowAmount);
    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(pipeData.borrowToken, output);
  }

  /// @dev function for repaying debt then withdrawing from collateral
  /// @param amount in underlying units
  /// @return output in source units
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    repay(amount);
    uint256 withdrawAmount = _collateralTokensUnlocked();
    withdrawCollateral(withdrawAmount);
    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
  }

  /// @dev function for investing, deposits, entering, borrowing
  /// @param amount in source units
  function depositCollateral(uint256 amount) private {
    _erc20Approve(pipeData.sourceToken, pipeData.stablecoin, amount);
    _stablecoin.depositCollateral(vaultID, amount);
  }

  /// @dev function for de-vesting, withdrawals, leaves, paybacks
  /// @param amount in underlying units
  function withdrawCollateral(uint256 amount) private {
    _stablecoin.withdrawCollateral(vaultID, amount);
  }

  /// @dev Borrow tokens
  /// @param borrowAmount in underlying units
  function borrow(uint256 borrowAmount) private {
    _stablecoin.borrowToken(vaultID, borrowAmount);
  }

  /// @dev Repay borrowed tokens
  /// @param amount in borrowed tokens
  /// @return output in borrowed tokens
  function repay(uint256 amount) private returns (uint256 output) {
    uint256 repayAmount = Math.min(amount, _stablecoin.vaultDebt(vaultID));
    _erc20Approve(pipeData.borrowToken, pipeData.stablecoin, amount);
    _stablecoin.payBackToken(vaultID, repayAmount);
    output = repayAmount;
  }

  /// @dev Returns true when rebalance needed
  function needsRebalance() override external view returns (bool){
    uint256 collateralPercentage = _stablecoin.checkCollateralPercentage(vaultID);
    if (collateralPercentage == 0) {
      // no debt or collateral
      return false;
    }
    return ((collateralPercentage + pipeData.maxImbalance) < pipeData.targetPercentage)
    || (collateralPercentage > (uint256(pipeData.targetPercentage) + pipeData.maxImbalance));
  }

  /// @dev function for re balancing. When rebalance
  /// @return imbalance in underlying units
  /// @return deficit - when true, then asks to receive underlying imbalance amount, when false - put imbalance to next pipe,
  function rebalance() override onlyPipeline external returns (uint256 imbalance, bool deficit) {
    uint256 collateralPercentage = _stablecoin.checkCollateralPercentage(vaultID);
    if (collateralPercentage == 0) {
      // no debt or collateral
      return (0, false);
    }

    if ((collateralPercentage + pipeData.maxImbalance) < pipeData.targetPercentage) {
      // we have deficit
      uint256 targetBorrow = _percentageToBorrowTokenAmount();
      uint256 debt = _stablecoin.vaultDebt(vaultID);
      uint256 repayAmount = debt - targetBorrow;

      uint256 available = _erc20Balance(pipeData.borrowToken);
      uint256 paidAmount = Math.min(repayAmount, available);
      if (paidAmount > 0) {
        repay(paidAmount);
      }

      uint256 change = _erc20Balance(pipeData.borrowToken);
      if (change > 0) {
        _transferERC20toNextPipe(pipeData.borrowToken, change);
        return (change, false);
      } else {
        return (repayAmount - paidAmount, true);
      }

    } else if (collateralPercentage > (uint256(pipeData.targetPercentage) + pipeData.maxImbalance)) {
      // we have excess
      uint256 targetBorrow = _percentageToBorrowTokenAmount();
      uint256 debt = _stablecoin.vaultDebt(vaultID);
      if (debt < targetBorrow) {
        borrow(targetBorrow - debt);
      }
      uint256 excess = _erc20Balance(pipeData.borrowToken);
      _transferERC20toNextPipe(pipeData.borrowToken, excess);
      return (excess, false);
    }

    return (0, false);
    // in balance
  }

  /// @dev Converts percentage to borrow token amount
  /// @return borrowAmount amount of borrow token for target percentage
  function _percentageToBorrowTokenAmount() private view returns (uint256 borrowAmount) {
    uint256 collateral = _stablecoin.vaultCollateral(vaultID);
    borrowAmount = _collateralToBorrowTokenAmount(collateral);
  }


  /// @dev Converts collateral amount to borrow amount using target Collateral to Debt percentage
  /// @param collateral amount in collateral token
  function _collateralToBorrowTokenAmount(uint256 collateral)
  private view returns (uint256 amount) {
    uint256 ethPrice = _stablecoin.getEthPriceSource();
    uint256 value = collateral * ethPrice / _stablecoin.getTokenPriceSource();
    amount = value * 100 / pipeData.targetPercentage;
  }
/*
  /// @dev converts borrow amount to collateral amount using target Collateral to Debt percentage
  /// @param borrowAmount amount in borrow token
  /// @param percentage is Collateral to Debt percentage from 135 and above
  function _borrowToCollateralTokenAmountPercentage(uint256 borrowAmount, uint256 percentage)
  private view returns (uint256 amount) {
    uint256 ethPrice = _stablecoin.getEthPriceSource();
    uint256 tokenPriceSource = _stablecoin.getTokenPriceSource();
    uint256 closingFee = _stablecoin.closingFee();

    // from https://github.com/0xlaozi/qidao/blob/308754139e0d701bdd2c8d4f66ae14ef8b2acdca/contracts/Stablecoin.sol#L212
    uint256 fee = (borrowAmount * closingFee * tokenPriceSource) / (ethPrice * 10000);
    amount = borrowAmount * tokenPriceSource * percentage / (ethPrice*100) - fee;
  }*/

  /// @dev Returns how many collateral tokens excess necessary amount
  ///      to cover borrow amount with target collateral to debt percentage
  function _collateralTokensUnlocked()
  private view returns (uint256 amount) {
    uint256 ethPrice = _stablecoin.getEthPriceSource();
    uint256 tokenPriceSource = _stablecoin.getTokenPriceSource();
    uint256 borrowedAmount = _stablecoin.vaultDebt(vaultID);
    uint256 collateral = _stablecoin.vaultCollateral(vaultID);
    // collateral needed to have current borrowed tokens with target collateral to debt percentage
    uint256 collateralNeeded = borrowedAmount * tokenPriceSource * pipeData.targetPercentage
        / (ethPrice*100);
    if (collateral<collateralNeeded) {
      amount = 0;
    } else {
      amount = collateral - collateralNeeded;
    }
  }

  /// @dev Gets available MAI (miMATIC) to borrow at the Mai Stablecoin contract.
  /// @return miMatic borrow token Stablecoin supply
  function availableMai() external view override returns (uint256) {
    return IERC20(pipeData.borrowToken).balanceOf(address(_stablecoin));
  }

}
