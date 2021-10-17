// SPDX-License-Identifier: ISC
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/

pragma solidity 0.8.4;

interface ITetuSwapPair {

  function balanceOfVaultUnderlying(address _token) external view returns (uint);

  function setFee(uint _fee) external;

  function setVaults(address _vault0, address _vault1) external;

  function setRewardRecipient(address _recipient) external;

  function claimAll() external;

  function MINIMUM_LIQUIDITY() external pure returns (uint);

  function factory() external view returns (address);

  function rewardRecipient() external view returns (address);

  function fee() external view returns (uint);

  function token0() external view returns (address);

  function token1() external view returns (address);

  function vault0() external view returns (address);

  function vault1() external view returns (address);

  function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);

  function price0CumulativeLast() external view returns (uint);

  function price1CumulativeLast() external view returns (uint);

  function mint(address to) external returns (uint liquidity);

  function burn(address to) external returns (uint amount0, uint amount1);

  function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;

  function sync() external;

  function initialize(
    address _token0,
    address _token1,
    uint _fee
  ) external;

}
