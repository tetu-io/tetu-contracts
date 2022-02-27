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

import "./../../../../openzeppelin/IERC20.sol";
import "./../../../../openzeppelin/SafeERC20.sol";
import "./../../../../openzeppelin/Initializable.sol";
import "../../../../openzeppelin/Math.sol";
import "./Pipe.sol";
import "./../../../../third_party/qidao/IErc20Stablecoin.sol";
import "../../../interface/strategies/IMaiStablecoinPipe.sol";

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
    address rewardToken;
    uint256 collateralNumerator; // 1 for all tokens except 10*10 for WBTC erc20Stablecoin-cam-wbtc.sol at mai-qidao as it have only 8 decimals
  }

  MaiStablecoinPipeData public pipeData;
  IErc20Stablecoin public _stablecoin;
  uint256 public vaultID;

  event Rebalanced(uint256 borrowed, uint256 repaid);
  event Borrowed(uint256 amount);
  event Repaid(uint256 amount);

  function initialize(MaiStablecoinPipeData memory _d) public initializer {
    require(_d.stablecoin != address(0), "Zero stablecoin");
    require(_d.rewardToken != address(0), "Zero reward token");

    Pipe._initialize('MaiStablecoinPipe', _d.sourceToken, _d.borrowToken);

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
    return _availableMai();
  }

  /// @dev Returns price of source token (cam), when vault will be liquidated, based on _minimumCollateralPercentage
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
    price = (borrowedAmount * tokenPriceSource * _stablecoin._minimumCollateralPercentage())
    / (collateral * 100 * pipeData.collateralNumerator);
  }

  /// @dev Returns maximal possible deposit of amToken, based on available mai and target percentage.
  /// @return max camToken maximum deposit
  function maxDeposit() external view override returns (uint256 max) {
    uint256 tokenPriceSource = _stablecoin.getTokenPriceSource();
    uint256 amPrice = _stablecoin.getEthPriceSource();
    max = _availableMai() * tokenPriceSource * pipeData.targetPercentage / (amPrice * 100 * pipeData.collateralNumerator);
  }

  /// @dev Gets targetPercentage
  /// @return target collateral to debt percentage
  function targetPercentage() external view override returns (uint256) {
    return pipeData.targetPercentage;
  }

  /// @dev Gets maxImbalance
  /// @return maximum imbalance (+/-%) to do re-balance
  function maxImbalance() external view override returns (uint256) {
    return pipeData.maxImbalance;
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


  /// @dev Sets maxImbalance
  /// @param _maxImbalance - maximum imbalance deviation (+/-%)
  function setMaxImbalance(uint256 _maxImbalance) onlyPipeline override external {
    pipeData.maxImbalance = _maxImbalance;
  }

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
    if (amount != 0) {
      depositCollateral(amount);
      uint256 borrowAmount = _canSafelyBorrowMore();
      borrow(borrowAmount);
    }
    output = _erc20Balance(_outputToken());
    _transferERC20toNextPipe(pipeData.borrowToken, output);
    emit Put(amount, output);
  }

  /// @dev function for repaying debt then withdrawing from collateral
  /// @param amount in underlying units
  /// @return output in source units
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = maxOutputAmount(amount);
    if (amount != 0) {
      uint256 debt = _stablecoin.vaultDebt(vaultID);
      repay(amount);
      // repay subtracts fee from the collateral, so we get collateral after fees applied
      uint256 collateral = _stablecoin.vaultCollateral(vaultID);
      uint256 debtAfterRepay = _stablecoin.vaultDebt(vaultID);

      uint256 withdrawAmount = (debtAfterRepay == 0)
        ? collateral
        : (amount * collateral) / debt;
      withdrawCollateral(withdrawAmount);
    }
    address sourceToken = _sourceToken();
    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
    emit Get(amount, output);

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
        // do not borrow more than supply
        uint256 borrowAmount = Math.min(targetBorrow - debt, _availableMai());
        borrow(borrowAmount);
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
  /// collateral * collateralNumerator * ethPrice * 100 = borrow * tokenPrice * percentage

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
    if (pipeData.targetPercentage == 0 || tokenPriceSource == 0) {
      borrowAmount = 0;
    } else {
      borrowAmount = (collateral * pipeData.collateralNumerator * ethPrice * 100)
      / (tokenPriceSource * pipeData.targetPercentage);
    }
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


  /// @dev Gets available MAI (miMATIC) to borrow at the Mai Stablecoin contract.
  /// @return miMatic borrow token Stablecoin supply
  function _availableMai() private view returns (uint256) {
    return IERC20(pipeData.borrowToken).balanceOf(address(_stablecoin));
  }

  // ***************************************
  // ************** PRIVATE ****************
  // ***************************************

  /// @dev function for investing, deposits, entering, borrowing
  /// @param amount in source units
  function depositCollateral(uint256 amount) private {
    if (amount != 0) {
      _erc20Approve(pipeData.sourceToken, pipeData.stablecoin, amount);
      _stablecoin.depositCollateral(vaultID, amount);
    }
  }

  /// @dev function for de-vesting, withdrawals, leaves, paybacks
  /// @param amount in underlying units
  function withdrawCollateral(uint256 amount) private {
    if (amount != 0) {
      _stablecoin.withdrawCollateral(vaultID, amount);
    }
  }

  /// @dev Borrow tokens
  /// @param amount to borrow in underlying units
  function borrow(uint256 amount) private {
    if (amount != 0) {
      _stablecoin.borrowToken(vaultID, amount);
      emit Borrowed(amount);
    }
  }

  /// @dev Repay borrowed tokens
  /// @param amount in borrowed tokens
  /// @return repaid in borrowed tokens
  function repay(uint256 amount) private returns (uint256) {
    uint256 repayAmount = Math.min(amount, _stablecoin.vaultDebt(vaultID));
    if (repayAmount != 0) {
      _erc20Approve(pipeData.borrowToken, pipeData.stablecoin, repayAmount);
      _stablecoin.payBackToken(vaultID, repayAmount);
    }
    emit Repaid(repayAmount);
    return repayAmount;
  }

}
