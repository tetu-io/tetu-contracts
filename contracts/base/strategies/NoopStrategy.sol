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

import "./StrategyBase.sol";
import "../../third_party/IDelegation.sol";

/// @title Stubbing implementation of Base Strategy.
///        Use with Vaults that do nothing with underlying (like Profit Sharing)
/// @author belbix
contract NoopStrategy is StrategyBase {

  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "NoopStrategy";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.1.1";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 100_00;
  /// @dev Assets should reflect underlying tokens for investing
  address[] private _assets;
  Platform private _platform;

  /// @notice Contract constructor
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  /// @param __rewardTokens Reward tokens that the strategy will farm
  /// @param __assets Single tokens that need for investing
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address[] memory __assets,
    uint256 __platform
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    _assets = __assets;
    _platform = Platform(__platform);
  }

  function delegateVotes(address _delegateContract, address _delegate, bytes32 id) external restricted {
    IDelegation(_delegateContract).setDelegate(id, _delegate);
  }

  function clearDelegatedVotes(address _delegateContract, bytes32 id) external restricted {
    IDelegation(_delegateContract).clearDelegate(id);
  }

  /// @dev Stub function for Strategy Base implementation
  function rewardPoolBalance() public override pure returns (uint256 bal) {
    bal = 0;
  }

  /// @dev Stub function for Strategy Base implementation
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    // call empty functions for getting 100% test coverage
    withdrawAndClaimFromPool(0);
    emergencyWithdrawFromPool();
    liquidateReward();
  }

  /// @dev Stub function for Strategy Base implementation
  function depositToPool(uint256 amount) internal override {
    // noop
  }

  /// @dev Stub function for Strategy Base implementation
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    //noop
  }

  /// @dev Stub function for Strategy Base implementation
  function emergencyWithdrawFromPool() internal override {
    //noop
  }

  /// @dev Stub function for Strategy Base implementation
  //slither-disable-next-line dead-code
  function liquidateReward() internal override {
    // noop
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override view returns (Platform) {
    return _platform;
  }

  /// @dev Single Tokens that need to have for investing. Using for statistical purposes
  /// @return Array of assets
  function assets() external override view returns (address[] memory) {
    return _assets;
  }

  /// @dev Stub function for Strategy Base implementation
  function readyToClaim() external pure override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    return toClaim;
  }

  /// @dev Stub function for Strategy Base implementation
  function poolTotalAmount() external pure override returns (uint256) {
    return 0;
  }

}
