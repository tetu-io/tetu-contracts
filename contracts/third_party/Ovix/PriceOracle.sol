//SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "./IOToken.sol";

abstract contract PriceOracle {
    /// @notice Indicator that this is a PriceOracle contract (for inspection)
    bool public constant isPriceOracle = true;

    /**
     * @notice Get the underlying price of a oToken asset
     * @param oToken The oToken to get the underlying price of
     * @return The underlying asset price mantissa (scaled by 1e18).
     *  Zero means the price is unavailable.
     */
    function getUnderlyingPrice(IOToken oToken)
        external
        view
        virtual
        returns (uint256);
}
