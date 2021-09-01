// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

abstract contract IronControllerInterface {
    /// @notice Indicator that this is a IronController contract (for inspection)
    bool public constant isIronController = true;

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata RTokens) virtual external returns (uint[] memory);
    function exitMarket(address RToken) virtual external returns (uint);

    /*** Policy Hooks ***/

    function mintAllowed(address RToken, address minter, uint mintAmount) virtual external returns (uint);
    function mintVerify(address RToken, address minter, uint mintAmount, uint mintTokens) virtual external;

    function redeemAllowed(address RToken, address redeemer, uint redeemTokens) virtual external returns (uint);
    function redeemVerify(address RToken, address redeemer, uint redeemAmount, uint redeemTokens) virtual external;

    function borrowAllowed(address RToken, address borrower, uint borrowAmount) virtual external returns (uint);
    function borrowVerify(address RToken, address borrower, uint borrowAmount) virtual external;

    function repayBorrowAllowed(
        address RToken,
        address payer,
        address borrower,
        uint repayAmount) virtual external returns (uint);
    function repayBorrowVerify(
        address RToken,
        address payer,
        address borrower,
        uint repayAmount,
        uint borrowerIndex) virtual external;

    function liquidateBorrowAllowed(
        address RTokenBorrowed,
        address RTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount) virtual external returns (uint);
    function liquidateBorrowVerify(
        address RTokenBorrowed,
        address RTokenCollateral,
        address liquidator,
        address borrower,
        uint repayAmount,
        uint seizeTokens) virtual external;

    function seizeAllowed(
        address RTokenCollateral,
        address RTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens) virtual external returns (uint);
    function seizeVerify(
        address RTokenCollateral,
        address RTokenBorrowed,
        address liquidator,
        address borrower,
        uint seizeTokens) virtual external;

    function transferAllowed(address RToken, address src, address dst, uint transfeRTokens) virtual external returns (uint);
    function transferVerify(address RToken, address src, address dst, uint transfeRTokens) virtual external;

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address RTokenBorrowed,
        address RTokenCollateral,
        uint repayAmount) virtual external view returns (uint, uint);


    function claimReward(address holder, address[] memory rTokens) virtual external;
}
