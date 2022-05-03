//SPDX-License-Identifier: Unlicense

pragma solidity 0.8.4;

/// see https://curve.readthedocs.io/exchange-pools.html
interface ITricryptoPool {

  function add_liquidity(uint256[5] calldata amounts, uint256 min_mint_amount) external;

  function exchange_underlying(uint256 i, uint256 j, uint256 dx, uint256 min_dy, address receiver) external;
}
