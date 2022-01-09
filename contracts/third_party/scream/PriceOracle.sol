// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface PriceOracle {

  /**
    * @notice Get the underlying price of a scToken asset
    * @param scToken The scToken to get the underlying price of
    * @return The underlying asset price mantissa (scaled by 1e18).
    *  Zero means the price is unavailable.
    */
  function getUnderlyingPrice(address scToken) external view returns (uint);
}