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

import "../StrategyBase.sol";
import "../../../swap/interfaces/ITetuSwapPair.sol";
import "../../interface/ISmartVault.sol";

/// @title Abstract contract for Tetu swap strategy implementation
/// @author belbix
abstract contract TetuSwapStrategyBase is StrategyBase {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "TetuSwapStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.2.2";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  /// @dev 10% buybacks
  uint256 private constant _BUY_BACK_RATIO = 10_00;

  /// @notice TetuSwap pair
  address public pair;

  /// @notice Uniswap router for underlying LP
  address public router;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  /// @param __rewardTokens Reward tokens that the strategy will farm
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _router
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_vault != address(0), "Zero vault");
    require(_underlying != address(0), "Zero underlying");
    pair = _underlying;
    _rewardTokens.push(ITetuSwapPair(pair).token0());
    _rewardTokens.push(ITetuSwapPair(pair).token1());
    router = _router;
  }

  // ************* VIEWS *******************

  /// @notice Stabbed to 0
  function rewardPoolBalance() public override pure returns (uint256) {
    return 0;
  }

  /// @notice Stabbed to 0
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](rewardTokens().length);
    return rewards;
  }

  /// @notice Pair total supply
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(pair).totalSupply();
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    ITetuSwapPair(pair).claimAll();
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev No operations
  function depositToPool(uint256 amount) internal override {
    // noop
  }

  /// @dev No operations
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    // noop
  }

  /// @dev No operations
  function emergencyWithdrawFromPool() internal override {
    // noop
  }
}
