// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "./InterestRateModel.sol";
import "./EIP20NonStandardInterface.sol";

abstract contract CTokenStorage {
  /**
   * @dev Guard variable for re-entrancy checks
   */
  bool internal _notEntered;

  /**
   * @notice EIP-20 token name for this token
   */
  string public name;

  /**
   * @notice EIP-20 token symbol for this token
   */
  string public symbol;

  /**
   * @notice EIP-20 token decimals for this token
   */
  uint8 public decimals;

  /**
   * @notice Maximum borrow rate that can ever be applied (.0005% / block)
   */

  uint internal constant borrowRateMaxMantissa = 0.0005e16;

  /**
   * @notice Maximum fraction of interest that can be set aside for reserves
   */
  uint internal constant reserveFactorMaxMantissa = 1e18;

  /**
   * @notice Administrator for this contract
   */
  address payable public admin;

  /**
   * @notice Pending administrator for this contract
   */
  address payable public pendingAdmin;


  /**
   * @notice Model which tells what the current interest rate should be
   */
  InterestRateModel public interestRateModel;

  /**
   * @notice Initial exchange rate used when minting the first CTokens (used when totalSupply = 0)
   */
  uint internal initialExchangeRateMantissa;

  /**
   * @notice Fraction of interest currently set aside for reserves
   */
  uint public reserveFactorMantissa;

  /**
   * @notice Block number that interest was last accrued at
   */
  uint public accrualBlockNumber;

  /**
   * @notice Accumulator of the total earned interest rate since the opening of the market
   */
  uint public borrowIndex;

  /**
   * @notice Total amount of outstanding borrows of the underlying in this market
   */
  uint public totalBorrows;

  /**
   * @notice Total amount of reserves of the underlying held in this market
   */
  uint public totalReserves;

  /**
   * @notice Total number of tokens in circulation
   */
  uint public totalSupply;

  /**
   * @notice Official record of token balances for each account
   */
  mapping(address => uint) internal accountTokens;

  /**
   * @notice Approved token transfer amounts on behalf of others
   */
  mapping(address => mapping(address => uint)) internal transferAllowances;

  /**
   * @notice Container for borrow balance information
   * @member principal Total balance (with accrued interest), after applying the most recent balance-changing action
   * @member interestIndex Global borrowIndex as of the most recent balance-changing action
   */
  struct BorrowSnapshot {
    uint principal;
    uint interestIndex;
  }

  /**
   * @notice Mapping of account addresses to outstanding borrow balances
   */
  mapping(address => BorrowSnapshot) internal accountBorrows;
}

abstract contract CTokenInterface is CTokenStorage {

  /*** Market Events ***/

  /**
   * @notice Event emitted when interest is accrued
   */
  event AccrueInterest(uint cashPrior, uint interestAccumulated, uint borrowIndex, uint totalBorrows);

  /**
   * @notice Event emitted when tokens are minted
   */
  event Mint(address minter, uint mintAmount, uint mintTokens);

  /**
   * @notice Event emitted when tokens are redeemed
   */
  event Redeem(address redeemer, uint redeemAmount, uint redeemTokens);

  /**
   * @notice Event emitted when underlying is borrowed
   */
  event Borrow(address borrower, uint borrowAmount, uint accountBorrows, uint totalBorrows);

  /**
   * @notice Event emitted when a borrow is repaid
   */
  event RepayBorrow(address payer, address borrower, uint repayAmount, uint accountBorrows, uint totalBorrows);

  /**
   * @notice Event emitted when a borrow is liquidated
   */
  event LiquidateBorrow(address liquidator, address borrower, uint repayAmount, address RTokenCollateral, uint seizeTokens);


  /*** Admin Events ***/

  /**
   * @notice Event emitted when pendingAdmin is changed
   */
  event NewPendingAdmin(address oldPendingAdmin, address newPendingAdmin);

  /**
   * @notice Event emitted when pendingAdmin is accepted, which means admin is updated
   */
  event NewAdmin(address oldAdmin, address newAdmin);

  /**
   * @notice Event emitted when interestRateModel is changed
   */
  event NewMarketInterestRateModel(InterestRateModel oldInterestRateModel, InterestRateModel newInterestRateModel);

  /**
   * @notice Event emitted when the reserve factor is changed
   */
  event NewReserveFactor(uint oldReserveFactorMantissa, uint newReserveFactorMantissa);

  /**
   * @notice Event emitted when the reserves are added
   */
  event ReservesAdded(address benefactor, uint addAmount, uint newTotalReserves);

  /**
   * @notice Event emitted when the reserves are reduced
   */
  event ReservesReduced(address admin, uint reduceAmount, uint newTotalReserves);

  /**
   * @notice EIP20 Transfer event
   */
  event Transfer(address indexed from, address indexed to, uint amount);

  /**
   * @notice EIP20 Approval event
   */
  event Approval(address indexed owner, address indexed spender, uint amount);

  /**
   * @notice Failure event
   */
  event Failure(uint error, uint info, uint detail);


  /*** User Interface ***/

  function transfer(address dst, uint amount) virtual external returns (bool);

  function transferFrom(address src, address dst, uint amount) virtual external returns (bool);

  function approve(address spender, uint amount) virtual external returns (bool);

  function allowance(address owner, address spender) virtual external view returns (uint);

  function balanceOf(address owner) virtual external view returns (uint);

  function balanceOfUnderlying(address owner) virtual external returns (uint);

  function getAccountSnapshot(address account) virtual external view returns (uint, uint, uint, uint);

  function borrowRatePerBlock() virtual external view returns (uint);

  function supplyRatePerBlock() virtual external view returns (uint);

  function totalBorrowsCurrent() virtual external returns (uint);

  function borrowBalanceCurrent(address account) virtual external returns (uint);

  function borrowBalanceStored(address account) virtual external view returns (uint);

  function exchangeRateCurrent() virtual external returns (uint);

  function exchangeRateStored() virtual external view returns (uint);

  function getCash() virtual external view returns (uint);

  function accrueInterest() virtual external returns (uint);

  function seize(address liquidator, address borrower, uint seizeTokens) virtual external returns (uint);

}

abstract contract CErc20Storage {
  /**
   * @notice Underlying asset for this RToken
   */
  address public underlying;
}

abstract contract CErc20Interface is CErc20Storage {

  /*** User Interface ***/

  function mint(uint mintAmount) virtual external returns (uint);

  function redeem(uint redeemTokens) virtual external returns (uint);

  function redeemUnderlying(uint redeemAmount) virtual external returns (uint);

  function borrow(uint borrowAmount) virtual external returns (uint);

  function repayBorrow(uint repayAmount) virtual external returns (uint);

  function repayBorrowBehalf(address borrower, uint repayAmount) virtual external returns (uint);

  function liquidateBorrow(address borrower, uint repayAmount, CTokenInterface RTokenCollateral) virtual external returns (uint);

  function sweepToken(EIP20NonStandardInterface token) virtual external;

}
