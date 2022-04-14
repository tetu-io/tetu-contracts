//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./IOToken.sol";
import "./PriceOracle.sol";

interface IComptroller {
    /// @notice Indicator that this is a Comptroller contract (for inspection)
    function isComptroller() external view returns (bool);

    /*** Assets You Are In ***/

    function enterMarkets(address[] calldata oTokens)
        external
        returns (uint256[] memory);

    function exitMarket(address oToken) external returns (uint256);

    /*** Policy Hooks ***/

    function mintAllowed(
        address oToken,
        address minter,
        uint256 mintAmount
    ) external returns (uint256);

    function mintVerify(
        address oToken,
        address minter,
        uint256 mintAmount,
        uint256 mintTokens
    ) external;

    function redeemAllowed(
        address oToken,
        address redeemer,
        uint256 redeemTokens
    ) external returns (uint256);

    function redeemVerify(
        address oToken,
        address redeemer,
        uint256 redeemAmount,
        uint256 redeemTokens
    ) external;

    function borrowAllowed(
        address oToken,
        address borrower,
        uint256 borrowAmount
    ) external returns (uint256);

    function borrowVerify(
        address oToken,
        address borrower,
        uint256 borrowAmount
    ) external;

    function repayBorrowAllowed(
        address oToken,
        address payer,
        address borrower,
        uint256 repayAmount
    ) external returns (uint256);

    function liquidateBorrowAllowed(
        address oTokenBorrowed,
        address oTokenCollateral,
        address liquidator,
        address borrower,
        uint256 repayAmount
    ) external returns (uint256);

    function seizeAllowed(
        address oTokenCollateral,
        address oTokenBorrowed,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) external returns (uint256);

    function seizeVerify(
        address oTokenCollateral,
        address oTokenBorrowed,
        address liquidator,
        address borrower,
        uint256 seizeTokens
    ) external;

    function transferAllowed(
        address oToken,
        address src,
        address dst,
        uint256 transferTokens
    ) external returns (uint256);

    function transferVerify(
        address oToken,
        address src,
        address dst,
        uint256 transferTokens
    ) external;

    /*** Liquidity/Liquidation Calculations ***/

    function liquidateCalculateSeizeTokens(
        address oTokenBorrowed,
        address oTokenCollateral,
        uint256 repayAmount
    ) external view returns (uint256, uint256);

    function isMarket(address market) external view returns (bool);

    function getBoostManager() external view returns (address);

    function getAllMarkets() external view returns (IOToken[] memory);

    function oracle() external view returns (PriceOracle);

    function updateAndDistributeSupplierRewardsForToken(
        address oToken,
        address account
    ) external;

    function updateAndDistributeBorrowerRewardsForToken(
        address oToken,
        address borrower
    ) external;

    function _setRewardSpeeds(
        address[] memory oTokens,
        uint256[] memory supplySpeeds,
        uint256[] memory borrowSpeeds
    ) external;

    function rewardAccrued(address account) external view returns (uint256);

    function claimRewards(address holder, IOToken[] memory oTokens) external;

    function rewardSpeeds(address oToken) external view returns (uint256);
}
