//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./IOToken.sol";
import "./IComptroller.sol";
import "./IInterestRateModel.sol";

abstract contract OTokenStorage is IOToken {
    bool public constant override isOToken = true;

    /**
     * @dev Guard variable for re-entrancy checks
     */
    bool internal _notEntered;

    /**
     * @notice EIP-20 token name for this token
     */
    string public override name;

    /**
     * @notice EIP-20 token symbol for this token
     */
    string public override symbol;

    /**
     * @notice EIP-20 token decimals for this token
     */
    uint8 public override decimals;

    /**
     * @notice Maximum borrow rate that can ever be applied (.0005% / block)
     */

    uint256 internal constant borrowRateMaxMantissa = 0.0005e16;

    /**
     * @notice Maximum fraction of interest that can be set aside for reserves
     */
    uint256 internal constant reserveFactorMaxMantissa = 1e18;

    /**
     * @notice Administrator for this contract
     */
    address payable public admin;

    /**
     * @notice Pending administrator for this contract
     */
    address payable public pendingAdmin;

    /**
     * @notice Contract which oversees inter-oToken operations
     */
    IComptroller public override comptroller;

    /**
     * @notice Model which tells what the current interest rate should be
     */
    IInterestRateModel public interestRateModel;

    /**
     * @notice Initial exchange rate used when minting the first OTokens (used when totalSupply = 0)
     */
    uint256 internal initialExchangeRateMantissa;

    /**
     * @notice Fraction of interest currently set aside for reserves
     */
    uint256 public override reserveFactorMantissa;

    /**
     * @notice Block number that interest was last accrued at
     */
    uint256 public override accrualBlockTimestamp;

    /**
     * @notice Accumulator of the total earned interest rate since the opening of the market
     */
    uint256 public override borrowIndex;

    /**
     * @notice Total amount of outstanding borrows of the underlying in this market
     */
    uint256 public override totalBorrows;

    /**
     * @notice Total amount of reserves of the underlying held in this market
     */
    uint256 public totalReserves;

    /**
     * @notice Total number of tokens in circulation
     */
    uint256 public override totalSupply;

    /**
     * @notice Official record of token balances for each account
     */
    mapping(address => uint256) internal accountTokens;

    /**
     * @notice Approved token transfer amounts on behalf of others
     */
    mapping(address => mapping(address => uint256)) internal transferAllowances;

    /**
     * @notice Container for borrow balance information
     * @member principal Total balance (with accrued interest), after applying the most recent balance-changing action
     * @member interestIndex Global borrowIndex as of the most recent balance-changing action
     */
    struct BorrowSnapshot {
        uint256 principal;
        uint256 interestIndex;
    }

    /**
     * @notice Mapping of account addresses to outstanding borrow balances
     */
    mapping(address => BorrowSnapshot) internal accountBorrows;

    /**
     * @notice Share of seized collateral that is added to reserves
     */
    uint256 public protocolSeizeShareMantissa;
}
