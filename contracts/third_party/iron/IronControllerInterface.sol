// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface IronControllerInterface {
  /*** Assets You Are In ***/

  function enterMarkets(address[] calldata RTokens) external returns (uint[] memory);

  function exitMarket(address RToken) external returns (uint);

  /*** Policy Hooks ***/

  function mintAllowed(address RToken, address minter, uint mintAmount) external returns (uint);

  function mintVerify(address RToken, address minter, uint mintAmount, uint mintTokens) external;

  function redeemAllowed(address RToken, address redeemer, uint redeemTokens) external returns (uint);

  function redeemVerify(address RToken, address redeemer, uint redeemAmount, uint redeemTokens) external;

  function borrowAllowed(address RToken, address borrower, uint borrowAmount) external returns (uint);

  function borrowVerify(address RToken, address borrower, uint borrowAmount) external;

  function repayBorrowAllowed(
    address RToken,
    address payer,
    address borrower,
    uint repayAmount) external returns (uint);

  function repayBorrowVerify(
    address RToken,
    address payer,
    address borrower,
    uint repayAmount,
    uint borrowerIndex) external;

  function liquidateBorrowAllowed(
    address RTokenBorrowed,
    address RTokenCollateral,
    address liquidator,
    address borrower,
    uint repayAmount) external returns (uint);

  function liquidateBorrowVerify(
    address RTokenBorrowed,
    address RTokenCollateral,
    address liquidator,
    address borrower,
    uint repayAmount,
    uint seizeTokens) external;

  function seizeAllowed(
    address RTokenCollateral,
    address RTokenBorrowed,
    address liquidator,
    address borrower,
    uint seizeTokens) external returns (uint);

  function seizeVerify(
    address RTokenCollateral,
    address RTokenBorrowed,
    address liquidator,
    address borrower,
    uint seizeTokens) external;

  function transferAllowed(address RToken, address src, address dst, uint transfeRTokens) external returns (uint);

  function transferVerify(address RToken, address src, address dst, uint transfeRTokens) external;

  /*** Liquidity/Liquidation Calculations ***/

  function liquidateCalculateSeizeTokens(
    address RTokenBorrowed,
    address RTokenCollateral,
    uint repayAmount) external view returns (uint, uint);


  function claimReward(address holder, address[] memory rTokens) external;

  function rewardSpeeds(address rToken) external view returns (uint);

  function oracle() external view returns (address);

  function getAllMarkets() external view returns (address[] memory);

  function markets(address rToken) external view returns (bool isListed, uint collateralFactorMantissa);

  function getAccountLiquidity(address account) external view returns (uint, uint, uint);

  function rewardAccrued(address account) external view returns (uint);
}
