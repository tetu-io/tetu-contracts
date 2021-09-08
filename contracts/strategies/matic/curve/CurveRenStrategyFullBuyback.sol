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

import "../../../base/strategies/curve/CurveStrategyFullBuyback.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../../../third_party/curve/IGauge.sol";
import "../../../base/strategies/StrategyBase.sol";


/// @title Contract for Curve REN strategy implementation
/// @author Oleg N
contract CurveRenStrategyFullBuyback is CurveStrategyFullBuyback {

  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************

  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "CurveRenStrategyFullBuyback";

  /// rewards
  address private constant WMATIC = address(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
  address private constant CRV = address(0x172370d5Cd63279eFa6d502DAB29171933a610AF);

  address[] private poolRewards = [WMATIC, CRV];

  /// deposit tokens
  address private constant WBTC = address(0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6);
  address private constant RENBTC = address(0xDBf31dF14B66535aF65AaC99C32e9eA844e14501);

  /// @notice Curve gauge rewards pool
  address public constant CURVE_REN_GAUGE = address(0xffbACcE0CC7C19d46132f1258FC16CF6871D153c);

  address[] private _assets = [WBTC, RENBTC];

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  constructor(
    address _controller,
    address _underlying,
    address _vault
  ) CurveStrategyFullBuyback(_controller, _underlying, _vault, poolRewards, CURVE_REN_GAUGE) {}

  /// assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return _assets;
  }

}
