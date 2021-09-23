// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface IronPriceOracle {

  /**
    * @notice Get the underlying price of a rToken asset
    * @param rToken The rToken to get the underlying price of
    * @return The underlying asset price mantissa (scaled by 1e18).
    *  Zero means the price is unavailable.
    */
  function getUnderlyingPrice(address rToken) external view returns (uint);
}
