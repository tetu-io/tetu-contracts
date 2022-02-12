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

import "./IMultiSwap2.sol";

/// @title Dedicated solution for interacting with Tetu vaults.
///        Able to zap in/out assets to vaults
/// @author belbix, bogdoslav
interface IZapContract2 {

  struct ZapInfo {
    address lp;
    address tokenIn;
    address asset0;
    bytes asset0Route;
    address asset1;
    bytes asset1Route;
    uint tokenInAmount;
    uint slippageTolerance;
  }

  // ******************* VIEWS *****************************

  function routerForPair(address pair) external view returns (address);

  // ******************** USERS ACTIONS *********************

  /// @notice Approval for token is assumed.
  ///      Buy token and deposit to given vault
  ///      TokenIn should be declared as a keyToken in the PriceCalculator
  /// @param _vault A target vault for deposit
  /// @param _tokenIn This token will be swapped to required token for adding liquidity
  /// @param _asset Token address required for adding liquidity
  /// @param _routesData Pair weighted routes for buying asset0
  /// @param _tokenInAmount Amount of token for deposit
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapInto(
    address _vault,
    address _tokenIn,
    address _asset,
    bytes memory _routesData,
    uint _tokenInAmount,
    uint slippageTolerance
  ) external;

  /// @notice Approval for token is assumed.
  ///      Add liquidity and deposit to given vault with Uin pair underlying
  ///      TokenIn should be declared as a keyToken in the PriceCalculator
  /// @param _vault A target vault for deposit
  /// @param _tokenIn This token will be swapped to required token for adding liquidity
  /// @param _asset0 Token address required for adding liquidity
  /// @param _routesData0 Pair weighted routes for buying asset0
  /// @param _asset1 Token address required for adding liquidity
  /// @param _routesData1 Pair weighted routes for buying asset1
  /// @param _tokenInAmount Amount of token for deposit
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapIntoLp(
    address _vault,
    address _tokenIn,
    address _asset0,
    bytes memory _routesData0,
    address _asset1,
    bytes memory _routesData1,
    uint _tokenInAmount,
    uint slippageTolerance
  ) external;

  /// @notice Approval for share token is assumed.
  ///         Withdraw from given vault underlying and sell tokens for given tokenOut
  /// @param _vault A target vault for withdraw
  /// @param _tokenOut This token will be a target for swaps
  /// @param _asset Token address required selling removed assets
  /// @param _routesData Pair weighted routes for selling asset0
  /// @param _shareTokenAmount Amount of share token for withdraw
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapOut(
    address _vault,
    address _tokenOut,
    address _asset,
    bytes memory _routesData,
    uint _shareTokenAmount,
    uint slippageTolerance
  ) external;

  /// @notice Approval for share token is assumed.
  ///      Withdraw from given vault underlying, remove liquidity and sell tokens for given tokenOut
  /// @param _vault A target vault for withdraw
  /// @param _tokenOut This token will be a target for swaps
  /// @param _asset0 Token address required selling removed assets
  /// @param _routesData0 Pair weighted routes for selling asset0
  /// @param _asset1 Token address required selling removed assets
  /// @param _routesData1 Pair weighted routes for selling asset1
  /// @param _shareTokenAmount Amount of share token for withdraw
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapOutLp(
    address _vault,
    address _tokenOut,
    address _asset0,
    bytes memory _routesData0,
    address _asset1,
    bytes memory _routesData1,
    uint _shareTokenAmount,
    uint slippageTolerance
  ) external;

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint _amount) external;

}
