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
    uint256 targetPercentage; // Collateral to Debt target percentage
    uint256 maxImbalance;     // Maximum Imbalance in percents
    uint256 liquidationPercentage; // Collateral to Debt liquidation percentage
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


  // ***************************************
  // ************** EXTERNAL VIEWS *********
  // ***************************************

  /// @dev Gets available MAI (miMATIC) to borrow at the Mai Stablecoin contract.
  /// @return miMatic borrow token Stablecoin supply
  function availableMai() external view override returns (uint256) {
    return IERC20(pipeData.borrowToken).balanceOf(address(_stablecoin));
  }

  /// @dev Returns price of source token, when vault will be liquidated, based on liquidationPercentage
  ///      collateral to debt percentage. Returns 0 when no debt or collateral
  function liquidationPrice()
  external view override returns (uint256 price) {
    uint256 borrowedAmount = _stablecoin.vaultDebt(vaultID);
    if (borrowedAmount == 0) {
      return 0;
    }
    uint256 collateral = _stablecoin.vaultCollateral(vaultID);
    if (collateral == 0) {
      return 0;
    }
    uint256 tokenPriceSource = _stablecoin.getTokenPriceSource();
    price = (borrowedAmount * tokenPriceSource * pipeData.liquidationPercentage)
    / (collateral * 100);
  }

  /// @dev Gets targetPercentage
  /// @return target collateral to debt percentage
  function targetPercentage() external view override returns (uint256) {
    return pipeData.targetPercentage;
  }

  /// @dev Gets collateralPercentage
  /// @return current collateral to debt percentage
  function collateralPercentage() external view override returns (uint256) {
    return _stablecoin.checkCollateralPercentage(vaultID);
  }

  /// @dev Returns true when rebalance needed
  function needsRebalance() override external view returns (bool){
    uint256 currentPercentage = _stablecoin.checkCollateralPercentage(vaultID);
    if (currentPercentage == 0) {
      // no debt or collateral
      return false;
    }
    return ((currentPercentage + pipeData.maxImbalance) < pipeData.targetPercentage)
    || (currentPercentage > (uint256(pipeData.targetPercentage) + pipeData.maxImbalance));
  }

  // ***************************************
  // ************** EXTERNAL ***************
  // ***************************************


  /// @dev Sets targetPercentage
  /// @param _targetPercentage - target collateral to debt percentage
  function setTargetPercentage(uint256 _targetPercentage) onlyPipeline override external {
    pipeData.targetPercentage = _targetPercentage;
  }

  /// @dev function for depositing to collateral then borrowing
  /// @param amount in source units
  /// @return output in underlying units
  function put(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = maxSourceAmount(amount);
    depositCollateral(amount);
    uint256 borrowAmount = _canSafelyBorrowMore();
    borrow(borrowAmount);
    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(pipeData.borrowToken, output);
  }

  /// @dev function for repaying debt then withdrawing from collateral
  /// @param amount in underlying units
  /// @return output in source units
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = maxOutputAmount(amount);
    repay(amount);
    uint256 withdrawAmount = _collateralTokensUnlocked();
    withdrawCollateral(withdrawAmount);
    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
  }

  /// @dev function for re balancing. When rebalance
  /// @return imbalance in underlying units
  /// @return deficit - when true, then asks to receive underlying imbalance amount, when false - put imbalance to next pipe,
  function rebalance() override onlyPipeline
  external returns (uint256 imbalance, bool deficit) {
    uint256 currentPercentage = _stablecoin.checkCollateralPercentage(vaultID);
    if (currentPercentage == 0) {
      // no debt or collateral
      return (0, false);
    }

    if ((currentPercentage + pipeData.maxImbalance) < pipeData.targetPercentage) {
      // we have deficit
      uint256 targetBorrow = _canSafelyBorrowTotal();
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

    } else if (currentPercentage > (uint256(pipeData.targetPercentage) + pipeData.maxImbalance)) {
      // we have excess
      uint256 targetBorrow = _canSafelyBorrowTotal();
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

  // ***************************************
  // ************** PRIVATE VIEWS **********
  // ***************************************

  /// @dev base function for all calculations below is: (each side in borrow token price * 100)
  /// collateral * ethPrice * 100 = borrow * tokenPrice * percentage

  /// @dev Returns how much we can safely borrow total (based on percentage)
  /// @return borrowAmount amount of borrow token for target percentage
  function _canSafelyBorrowTotal()
  private view returns (uint256 borrowAmount) {
    uint256 collateral = _stablecoin.vaultCollateral(vaultID);
    if (collateral == 0) {
      return 0;
    }

    uint256 ethPrice = _stablecoin.getEthPriceSource();
    uint256 tokenPriceSource = _stablecoin.getTokenPriceSource();

    borrowAmount = (collateral * ethPrice * 100) / (tokenPriceSource * pipeData.targetPercentage);
  }

  /// @dev Returns how much more we can safely borrow (based on percentage)
  function _canSafelyBorrowMore()
  private view returns (uint256) {
    uint256 canBorrowTotal = _canSafelyBorrowTotal();
    uint256 borrowed = _stablecoin.vaultDebt(vaultID);

    if (borrowed >= canBorrowTotal) {
      return 0;
    } else {
      return canBorrowTotal - borrowed;
    }
  }

  /// @dev Returns how many collateral tokens excess necessary amount
  ///      to cover borrow amount with target collateral to debt percentage
  function _collateralTokensUnlocked()
  private view returns (uint256) {
    uint256 collateral = _stablecoin.vaultCollateral(vaultID);
    uint256 borrowedAmount = _stablecoin.vaultDebt(vaultID);
    if (borrowedAmount == 0) {
      return collateral;
    }

    uint256 ethPrice = _stablecoin.getEthPriceSource();
    uint256 tokenPriceSource = _stablecoin.getTokenPriceSource();
    // collateral needed to have current borrowed tokens with target collateral to debt percentage
    uint256 collateralNeeded = (borrowedAmount * tokenPriceSource * pipeData.targetPercentage)
        / (ethPrice * 100);

    if (collateral<collateralNeeded) {
      return 0;
    } else {
      return collateral - collateralNeeded;
    }
  }

  // ***************************************
  // ************** PRIVATE ****************
  // ***************************************

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

}
