//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

interface IRenBTCPool {

  /// @notice Deposit coins into the pool
  /// @param _amounts List of amounts of coins to deposit
  /// @param _min_mint_amount Minimum amount of LP tokens to mint from the deposit
  /// @param _use_underlying If True, deposit underlying assets instead of aTokens
  /// @return Amount of LP tokens received by depositing
  function add_liquidity(
    uint256[2] calldata _amounts,
    uint256 _min_mint_amount,
    bool _use_underlying) external returns (uint256);

  function exchange_underlying(int128 i, int128 j, uint256 dx, uint256 min_dy) external;
}
