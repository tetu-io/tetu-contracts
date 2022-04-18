//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./IEIP20NonStandard.sol";
import "./IOToken.sol";

interface IOErc20 {
    /*** User Interface ***/

    function mint(uint256 mintAmount) external returns (uint256);

    function redeem(uint256 redeemTokens) external returns (uint256);

    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);

    function borrow(uint256 borrowAmount) external returns (uint256);

    function repayBorrow(uint256 repayAmount) external returns (uint256);

    function repayBorrowBehalf(address borrower, uint256 repayAmount)
        external
        returns (uint256);

    function liquidateBorrow(
        address borrower,
        uint256 repayAmount,
        IOToken oTokenCollateral
    ) external returns (uint256);

    function sweepToken(IEIP20NonStandard token) external;

    function underlying() external view returns (address);

    /*** Admin Functions ***/

    function _addReserves(uint256 addAmount) external returns (uint256);
}
