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
import "../../../../openzeppelin/Math.sol";
import "../../../SlotsLib.sol";
import "./Pipe.sol";
import "./../../../../third_party/qidao/IErc20Stablecoin.sol";
import "../../../interface/strategies/IMaiStablecoinPipe.sol";

/// @title Mai Stablecoin Pipe Contract
/// @author bogdoslav
contract MaiStablecoinPipe is Pipe, IMaiStablecoinPipe {
  using SafeERC20 for IERC20;
  using SlotsLib for uint;

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

  uint internal constant _STABLECOIN_SLOT           = uint(keccak256("eip1967.MaiStablecoinPipe.stablecoin")) - 1;
  uint internal constant _BORROW_TOKEN_SLOT         = uint(keccak256("eip1967.MaiStablecoinPipe.borrowToken")) - 1;
  uint internal constant _TARGET_PERCENTAGE_SLOT    = uint(keccak256("eip1967.MaiStablecoinPipe.targetPercentage")) - 1;
  uint internal constant _MAX_IMBALANCE_SLOT        = uint(keccak256("eip1967.MaiStablecoinPipe.maxImbalance")) - 1;
  uint internal constant _COLLATERAL_NUMERATOR_SLOT = uint(keccak256("eip1967.MaiStablecoinPipe.collateralNumerator")) - 1;
  uint internal constant _VAULT_ID_SLOT             = uint(keccak256("eip1967.MaiStablecoinPipe.vaultID")) - 1;

  event Rebalanced(uint256 borrowed, uint256 repaid);
  event Borrowed(uint256 amount);
  event Repaid(uint256 amount);

  function initialize(MaiStablecoinPipeData memory _d) public {
    require(_d.stablecoin != address(0), "Zero stablecoin");
    require(_d.rewardToken != address(0), "Zero reward token");

    Pipe._initialize('MaiStablecoinPipe', _d.sourceToken, _d.borrowToken);

    rewardTokens.push(_d.rewardToken);

    _STABLECOIN_SLOT.set(_d.stablecoin);
    _BORROW_TOKEN_SLOT.set(_d.borrowToken);
    _TARGET_PERCENTAGE_SLOT.set(_d.targetPercentage);
    _MAX_IMBALANCE_SLOT.set(_d.maxImbalance);
    _COLLATERAL_NUMERATOR_SLOT.set(_d.collateralNumerator);

    _VAULT_ID_SLOT.set(IErc20Stablecoin(_d.stablecoin).createVault());
  }

  // ************* SLOT SETTERS/GETTERS *******************
  function vaultID() external override view returns (uint256) {
    return _vaultID();
  }

  function _vaultID() internal view returns (uint256) {
    return _VAULT_ID_SLOT.getUint();
  }

  function stablecoin() external override view returns (address) {
    return address(_stablecoin());
  }

  function _stablecoin() internal view returns (IErc20Stablecoin) {
    return IErc20Stablecoin(_STABLECOIN_SLOT.getAddress());
  }

  function borrowToken() external override view returns (address) {
    return _borrowToken();
  }

  function _borrowToken() internal view returns (address) {
    return _BORROW_TOKEN_SLOT.getAddress();
  }

/// @dev Gets targetPercentage
/// @return target collateral to debt percentage
  function targetPercentage() external override view returns (uint) {
    return _targetPercentage();
  }

  function _targetPercentage() internal view returns (uint) {
    return _TARGET_PERCENTAGE_SLOT.getUint();
  }

  /// @dev Gets maxImbalance
  /// @return maximum imbalance (+/-%) to do re-balance
  function maxImbalance() external override view returns (uint) {
    return _maxImbalance();
  }

  function _maxImbalance() internal view returns (uint) {
    return _MAX_IMBALANCE_SLOT.getUint();
  }

  function collateralNumerator() external override view returns (uint) {
    return _collateralNumerator();
  }

  function _collateralNumerator() internal view returns (uint) {
    return _COLLATERAL_NUMERATOR_SLOT.getUint();
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
    IErc20Stablecoin __stablecoin = _stablecoin();
    uint __vaultID = _vaultID();
    uint256 borrowedAmount = __stablecoin.vaultDebt(__vaultID);
    if (borrowedAmount == 0) {
      return 0;
    }
    uint256 collateral = __stablecoin.vaultCollateral(__vaultID);
    if (collateral == 0) {
      return 0;
    }
    uint256 tokenPriceSource = __stablecoin.getTokenPriceSource();
    price = (borrowedAmount * tokenPriceSource * __stablecoin._minimumCollateralPercentage())
    / (collateral * 100 * _collateralNumerator());
  }

  /// @dev Returns maximal possible deposit of amToken, based on available mai and target percentage.
  /// @return max camToken maximum deposit
  function maxDeposit() external view override returns (uint256 max) {
    IErc20Stablecoin __stablecoin = _stablecoin();
    uint256 tokenPriceSource = __stablecoin.getTokenPriceSource();
    uint256 amPrice = __stablecoin.getEthPriceSource();
    max = _availableMai() * tokenPriceSource * _targetPercentage()
      / (amPrice * 100 * _collateralNumerator());
  }

  /// @dev Gets collateralPercentage
  /// @return current collateral to debt percentage
  function collateralPercentage() external view override returns (uint256) {
    return _stablecoin().checkCollateralPercentage(_vaultID());
  }

  /// @dev Returns true when rebalance needed
  function needsRebalance() override external view returns (bool){
    uint256 currentPercentage = _stablecoin().checkCollateralPercentage(_vaultID());
    if (currentPercentage == 0) {
      // no debt or collateral
      return false;
    }
    uint __maxImbalance = _maxImbalance();
    uint __targetPercentage = _targetPercentage();
    return ((currentPercentage + __maxImbalance) < __targetPercentage)
    || (currentPercentage > (uint256(__targetPercentage) + __maxImbalance));
  }

  // ***************************************
  // ************** EXTERNAL ***************
  // ***************************************


  /// @dev Sets maxImbalance
  /// @param __maxImbalance - maximum imbalance deviation (+/-%)
  function setMaxImbalance(uint256 __maxImbalance) onlyPipeline override external {
    _MAX_IMBALANCE_SLOT.set(__maxImbalance);
  }

  /// @dev Sets targetPercentage
  /// @param __targetPercentage - target collateral to debt percentage
  function setTargetPercentage(uint256 __targetPercentage) onlyPipeline override external {
    _TARGET_PERCENTAGE_SLOT.set(__targetPercentage);
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
    _transferERC20toNextPipe(_borrowToken(), output);
    emit Put(amount, output);
  }

  /// @dev function for repaying debt then withdrawing from collateral
  /// @param amount in underlying units
  /// @return output in source units
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = maxOutputAmount(amount);
    if (amount != 0) {
      IErc20Stablecoin __stablecoin = _stablecoin();
      uint __vaultID = _vaultID();
      uint256 debt = __stablecoin.vaultDebt(__vaultID);
      repay(amount);
      // repay subtracts fee from the collateral, so we get collateral after fees applied
      uint256 collateral = __stablecoin.vaultCollateral(__vaultID);
      uint256 debtAfterRepay = __stablecoin.vaultDebt(__vaultID);

      uint256 withdrawAmount = (debtAfterRepay == 0)
        ? collateral
        : (amount * collateral) / debt;
      withdrawCollateral(withdrawAmount);
    }
    address __sourceToken = _sourceToken();
    output = _erc20Balance(__sourceToken);
    _transferERC20toPrevPipe(__sourceToken, output);
    emit Get(amount, output);
  }

  /// @dev function for re balancing. When rebalance
  /// @return imbalance in underlying units
  /// @return deficit - when true, then asks to receive underlying imbalance amount, when false - put imbalance to next pipe,
  function rebalance() override onlyPipeline
  external returns (uint256 imbalance, bool deficit) {
    IErc20Stablecoin __stablecoin = _stablecoin();
    uint256 currentPercentage = __stablecoin.checkCollateralPercentage(_vaultID());
    if (currentPercentage == 0) {
      // no debt or collateral
      return (0, false);
    }

    uint __maxImbalance = _maxImbalance();
    uint __targetPercentage = _targetPercentage();
    address __borrowToken = _borrowToken();

    if ((currentPercentage + __maxImbalance) < __targetPercentage) {
      // we have deficit
      uint256 targetBorrow = _canSafelyBorrowTotal();
      uint256 debt = __stablecoin.vaultDebt(_vaultID());
      uint256 repayAmount = debt - targetBorrow;

      uint256 available = _erc20Balance(__borrowToken);
      uint256 paidAmount = Math.min(repayAmount, available);
      if (paidAmount > 0) {
        repay(paidAmount);
      }

      uint256 change = _erc20Balance(__borrowToken);
      if (change > 0) {
        _transferERC20toNextPipe(__borrowToken, change);
        return (change, false);
      } else {
        return (repayAmount - paidAmount, true);
      }

    } else if (currentPercentage > (uint256(__targetPercentage) + __maxImbalance)) {
      // we have excess
      uint256 targetBorrow = _canSafelyBorrowTotal();
      uint256 debt = __stablecoin.vaultDebt(_vaultID());
      if (debt < targetBorrow) {
        // do not borrow more than supply
        uint256 borrowAmount = Math.min(targetBorrow - debt, _availableMai());
        borrow(borrowAmount);
      }
      uint256 excess = _erc20Balance(__borrowToken);
      _transferERC20toNextPipe(__borrowToken, excess);
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
    IErc20Stablecoin __stablecoin = _stablecoin();
    uint256 collateral = __stablecoin.vaultCollateral(_vaultID());
    if (collateral == 0) {
      return 0;
    }

    uint256 ethPrice = __stablecoin.getEthPriceSource();
    uint256 tokenPriceSource = __stablecoin.getTokenPriceSource();
    uint __targetPercentage = _targetPercentage();

    if (__targetPercentage == 0 || tokenPriceSource == 0) {
      borrowAmount = 0;
    } else {
      borrowAmount = (collateral * _collateralNumerator() * ethPrice * 100)
      / (tokenPriceSource * __targetPercentage);
    }
  }

  /// @dev Returns how much more we can safely borrow (based on percentage)
  function _canSafelyBorrowMore()
  private view returns (uint256) {
    uint256 canBorrowTotal = _canSafelyBorrowTotal();
    uint256 borrowed = _stablecoin().vaultDebt(_vaultID());

    if (borrowed >= canBorrowTotal) {
      return 0;
    } else {
      return canBorrowTotal - borrowed;
    }
  }


  /// @dev Gets available MAI (miMATIC) to borrow at the Mai Stablecoin contract.
  /// @return miMatic borrow token Stablecoin supply
  function _availableMai() private view returns (uint256) {
    return IERC20(_borrowToken()).balanceOf(address(_stablecoin()));
  }

  // ***************************************
  // ************** PRIVATE ****************
  // ***************************************

  /// @dev function for investing, deposits, entering, borrowing
  /// @param amount in source units
  function depositCollateral(uint256 amount) private {
    if (amount != 0) {
      IErc20Stablecoin __stablecoin = _stablecoin();
      _erc20Approve(_sourceToken(), address(__stablecoin), amount);
      __stablecoin.depositCollateral(_vaultID(), amount);
    }
  }

  /// @dev function for de-vesting, withdrawals, leaves, paybacks
  /// @param amount in underlying units
  function withdrawCollateral(uint256 amount) private {
    if (amount != 0) {
      _stablecoin().withdrawCollateral(_vaultID(), amount);
    }
  }

  /// @dev Borrow tokens
  /// @param amount to borrow in underlying units
  function borrow(uint256 amount) private {
    if (amount != 0) {
      _stablecoin().borrowToken(_vaultID(), amount);
      emit Borrowed(amount);
    }
  }

  /// @dev Repay borrowed tokens
  /// @param amount in borrowed tokens
  /// @return repaid in borrowed tokens
  function repay(uint256 amount) private returns (uint256) {
    uint __vaultID = _vaultID();
    IErc20Stablecoin __stablecoin = _stablecoin();
    uint256 repayAmount = Math.min(amount, __stablecoin.vaultDebt(__vaultID));
    if (repayAmount != 0) {
      _erc20Approve(_borrowToken(), address(__stablecoin), repayAmount);
      __stablecoin.payBackToken(__vaultID, repayAmount);
    }
    emit Repaid(repayAmount);
    return repayAmount;
  }

}
