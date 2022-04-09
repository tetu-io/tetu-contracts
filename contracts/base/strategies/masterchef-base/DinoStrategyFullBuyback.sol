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

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../../../third_party/dino/IFossilFarms.sol";
import "../StrategyBase.sol";

/// @title Abstract contract for Dino strategy implementation
/// @author belbix, bogdoslav
abstract contract DinoStrategyFullBuyback is StrategyBase {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "DinoStrategyFullBuyback";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.2";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;

  /// @notice Dino rewards pool
  address public pool;
  /// @notice Dino FossilFarms rewards pool ID
  uint256 public poolID;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param _controller Controller address
  /// @param _underlying Underlying token address
  /// @param _vault SmartVault address that will provide liquidity
  /// @param __rewardTokens Reward tokens that the strategy will farm
  /// @param _pool Dino FossilFarms pool address
  /// @param _poolID Pool id
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _pool,
    uint256 _poolID
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_pool != address(0), "zero address pool");
    pool = _pool;
    poolID = _poolID;

    (IERC20 lpToken,,,) = IFossilFarms(_pool).poolInfo(_poolID);
    require(address(lpToken) == _underlyingToken, "wrong underlying");
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the Dino FossilFarms pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint256 bal) {
    (bal,) = IFossilFarms(pool).userInfo(poolID, address(this));
  }

  /// @notice Return approximately amount of reward tokens ready to claim in Dino FossilFarms pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](1);
    toClaim[0] = IFossilFarms(pool).pendingDino(poolID, address(this));
    return toClaim;
  }

  /// @notice TVL of the underlying in the Dino FossilFarms pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(pool);
  }

  /// @notice Calculate approximately weekly reward amounts for DINO
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Weekly reward amount of DINO
  function computeWeeklyPoolReward() public view returns (uint256) {
    (, uint256 allocPoint, uint256 lastRewardBlock,) = IFossilFarms(pool).poolInfo(poolID);
    uint256 time = block.number - lastRewardBlock;
    uint256 dinoPerBlock = IFossilFarms(pool).dinoPerBlock();
    uint256 totalAllocPoint = IFossilFarms(pool).totalAllocPoint();
    uint256 sushiReward = time.mul(dinoPerBlock).mul(allocPoint).div(totalAllocPoint);
    uint256 averageBlockTime = 5;
    return sushiReward * (1 weeks * 1e18 / time / averageBlockTime) / 1e18;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    // Dino FossilFarms pool has the same underlying and reward token
    // need to be sure that we don't liquidate invested funds
    investAllUnderlying();
    // only claim rewards
    // TFossilFarms have no claim() method  https://github.com/DinoSwap/fossil-farms-contract/blob/main/FossilFarms.sol so we use withdraw with amount 0
    IFossilFarms(pool).withdraw(poolID,0);
    liquidateReward();
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to Dino FossilFarms pool
  /// @param amount Deposit amount
  function depositToPool(uint256 amount) internal override {
    IERC20(_underlyingToken).safeApprove(pool, 0);
    IERC20(_underlyingToken).safeApprove(pool, amount);
    IFossilFarms(pool).deposit(poolID, amount);
  }

  /// @dev Withdraw underlying from Dino FossilFarms pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    IFossilFarms(pool).withdraw(poolID, amount);
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    IFossilFarms(pool).emergencyWithdraw(poolID);
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

}
