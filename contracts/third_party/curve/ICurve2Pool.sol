//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

interface ICurve2Pool {

  function add_liquidity(
    uint256[2] calldata _amounts,
    uint256 _min_mint_amount) external returns (uint256);

  function exchange(int128 i, int128 j, uint256 dx, uint256 min_dy) external;
}
