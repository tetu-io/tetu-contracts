//SPDX-License-Identifier: Unlicense

pragma solidity 0.8.4;

interface ITricryptoPoolFtm {

  function add_liquidity(uint256[3] calldata amounts, uint256 min_mint_amount) external;

  function exchange(uint256 i, uint256 j, uint256 dx, uint256 min_dy, bool use_eth) external;

}
