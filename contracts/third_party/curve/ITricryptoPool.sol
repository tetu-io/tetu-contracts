//SPDX-License-Identifier: Unlicense

pragma solidity 0.8.4;

interface ITricryptoPool {

  function add_liquidity(uint256[5] calldata amounts, uint256 min_mint_amount) external;

  function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy, address receiver) external;

}
