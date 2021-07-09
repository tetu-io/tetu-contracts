// SPDX-License-Identifier: Unlicense
pragma solidity 0.7.6;

interface ICurveRegistry {
  function get_coins(address _pool) external view returns (address[8] memory);
  function get_underlying_coins(address _pool) external view returns (address[8] memory);
  function get_balances(address _pool) external view returns (uint256[8] memory);
  function get_underlying_balances(address _pool) external view returns (uint256[8] memory);
  function get_pool_from_lp_token(address _lp_token) external view returns (address);
  function get_lp_token(address _pool) external view returns (address);
  function pool_count() external view returns (uint256);
  function pool_list(uint256) external view returns (address);
  function get_decimals(address _pool) external view returns (uint256[8] memory);
  function get_underlying_decimals(address _pool) external view returns (uint256[8] memory);
  function get_coin_indices(address _pool, address _from, address _to) external view returns (int128, int128, bool);
  function find_pool_for_coins(address _from, address _to, uint256 i) external view returns (address);
}
