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

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./../StrategyBase.sol";
import "./pipelines/LinearPipeline.sol";
import "../../../third_party/uniswap/IWETH.sol";
import "../../interface/IMaiStablecoinPipe.sol";

/// @title AAVE->MAI->BAL Multi Strategy
/// @author belbix, bogdoslav
contract AaveMaiBalStrategyBase is StrategyBase, LinearPipeline {
  using SafeERC20 for IERC20;

  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "AaveMaiBalStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;

  /// @dev Assets should reflect underlying tokens for investing
  address[] private _assets;

  // cached total amount in underlying tokens, updated after each deposit, withdraw and hardwork
  uint256 private _totalAmount = 0;

  IMaiStablecoinPipe internal _maiStablecoinPipe;

  /// @notice Contract constructor
  constructor(
    address _controller,
    address _underlyingToken,
    address _vault,
    address[] memory __rewardTokens
  ) StrategyBase(_controller, _underlyingToken, _vault, __rewardTokens, _BUY_BACK_RATIO)
  LinearPipeline(_underlyingToken)
  {
    require(_controller != address(0), "Zero controller");
    require(_underlyingToken != address(0), "Zero underlying");
    require(_vault != address(0), "Zero vault");

    _rewardTokens = __rewardTokens;
    _assets.push(_underlyingToken);
  }

  modifier updateTotalAmount() {
    _;
    _totalAmount = getTotalAmountOut();
  }


  /// @dev Returns reward pool balance
  function rewardPoolBalance() public override view returns (uint256 bal) {
    return _totalAmount;
  }

  /// @dev HardWork function for Strategy Base implementation
  function doHardWork() external onlyNotPausedInvesting override restricted {
    uint balance = IERC20(_underlyingToken).balanceOf(address(this));
    if (balance > 0) {
      _pumpIn(balance);
    }
    _rebalanceAllPipes();
    _claimFromAllPipes();
    liquidateReward();
  }

  /// @dev Stub function for Strategy Base implementation
  function depositToPool(uint256 underlyingAmount) internal override updateTotalAmount {
    _pumpIn(underlyingAmount);
  }

  /// @dev Function to withdraw from pool
  function withdrawAndClaimFromPool(uint256 underlyingAmount) internal override updateTotalAmount {
    _claimFromAllPipes();
    _pumpOutSource(underlyingAmount, 0);
  }

  /// @dev Emergency withdraws all most underlying from the pool
  function emergencyWithdrawFromPool() internal override updateTotalAmount {
    _pumpOut(_getMostUnderlyingBalance(), 0);
  }

  /// @dev Liquidate all reward tokens
  //slither-disable-next-line dead-code
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  /// @dev Returns how much tokens are ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    return toClaim;
  }

  /// @dev Returns underlying pool total amount
  /// @dev Only for statistic
  function poolTotalAmount() external pure override returns (uint256) {
    // We may use few pools in the pipeline.
    // If you know what pool total amount you need for statistic purposes, you can override it in strategy implementation
    return 1;
    // for tests it now stubbed to 1
  }

  /// @dev Returns assets array
  function assets() external view override returns (address[] memory) {
    return _assets;
  }

  /// @dev Returns platform index
  function platform() external pure override returns (Platform) {
    return Platform.AAVE_MAI_BAL;
  }

  /// @dev Sets targetPercentage for MaiStablecoinPipe
  /// @param _targetPercentage - target collateral to debt percentage
  function setTargetPercentage(uint256 _targetPercentage) onlyControllerOrGovernance external {
    _maiStablecoinPipe.setTargetPercentage(_targetPercentage);
    _rebalanceAllPipes();
  }

  /// @dev Gets targetPercentage of MaiStablecoinPipe
  /// @return collateral to debt percentage
  function targetPercentage() external view returns (uint256) {
    return _maiStablecoinPipe.targetPercentage();
  }

  /// @dev Gets available MAI to borrow at the Mai Stablecoin contract. Should be checked at UI before deposit
  /// @return MAI (miMATIC) supply
  function availableMai() external view returns (uint256) {
    return _maiStablecoinPipe.availableMai();
  }

  // ***************************************
  // ************** GOVERNANCE ACTIONS *****
  // ***************************************

  /// @notice Controller can claim coins that are somehow transferred into the contract
  ///         Note that they cannot come in take away coins that are used and defined in the strategy itself
  /// @param recipient Recipient address
  /// @param token Token address
  function salvageFromPipeline(address recipient, address token) external onlyControllerOrGovernance updateTotalAmount {
    _salvageFromAllPipes(recipient, token);
    // transfers token to this contract
  }

  function rebalanceAllPipes() external onlyControllerOrGovernance updateTotalAmount {
    _rebalanceAllPipes();
  }

}
