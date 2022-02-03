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
import "../../ArrayLib.sol";
import "../../../third_party/synthetix/SNXRewardInterface.sol";


contract QuickSyrupStrategyBase is StrategyBase {
  using SafeERC20 for IERC20;
  using ArrayLib for address[];

  struct PoolInfo {
    address pool;
    uint fractionNumerator;
    uint capacity;
  }

  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "QuickSyrupStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;
  /// @dev Fraction denominator
  uint public constant FRACTION_DENOMINATOR = 1000;

  /// @dev Assets should reflect underlying tokens for investing
  address[] private _assets;

  PoolInfo[] public poolsInfo;

  uint private _amountUnderControl;


  /// @notice Contract constructor
  constructor(
    address _controller,
    address _underlyingToken,
    address _vault,
    address[] memory __rewardTokens
  ) StrategyBase(_controller, _underlyingToken, _vault, __rewardTokens, _BUY_BACK_RATIO){
    require(_controller != address(0), "Zero controller");
    require(_underlyingToken != address(0), "Zero underlying");
    require(_vault != address(0), "Zero vault");

    _assets.push(_underlyingToken);
  }

  modifier updateAmountUnderControl() {
    _;
    _amountUnderControl = _getAmountUnderControl();
  }

  /// @dev Returns cached underlying amount under control
  function rewardPoolBalance() public override view returns (uint256 bal) {
    return _amountUnderControl;
  }

  /// @notice Return approximately amount of reward tokens ready to claim in the all pools
  ///         Can fail with huge pools length
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](poolsInfo.length);
    for (uint i; i < toClaim.length; i++) {
      toClaim[i] = SNXRewardInterface(poolsInfo[i].pool).earned(address(this));
    }
    return toClaim;
  }

  /// @dev HardWork function for Strategy Base implementation
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    //    investAllUnderlying();
    _claimAll();
    liquidateReward();
  }

  /// @dev todo
  function _claimAll() private {

  }

  /// @dev todo
  function depositToPool(uint256 fullAmount) internal override {
    for (uint i; i < poolsInfo.length; i++) {
      PoolInfo memory poolInfo = poolsInfo[i];
      uint amount = fullAmount * poolInfo.fractionNumerator / FRACTION_DENOMINATOR;
      IERC20(_underlyingToken).safeApprove(poolInfo.pool, 0);
      IERC20(_underlyingToken).safeApprove(poolInfo.pool, amount);
      SNXRewardInterface(poolInfo.pool).stake(amount);
    }
  }

  /// @dev todo
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    //noop
  }

  /// @dev todo
  function emergencyWithdrawFromPool() internal override {
    //noop
  }

  /// @dev todo
  function liquidateReward() internal override {
    // noop
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.TETU;
  }

  /// @dev Single Tokens that need to have for investing. Using for statistical purposes
  /// @return Array of assets
  function assets() external override view returns (address[] memory) {
    return _assets;
  }

  /// @dev todo
  function poolTotalAmount() external pure override returns (uint256) {
    return 0;
  }

  /// @dev todo
  function _getAmountUnderControl() private pure returns (uint){
    return 0;
  }

}
