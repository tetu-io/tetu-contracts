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
import "../../../third_party/beethoven/IBeethovenxChef.sol";
import "../../../third_party/beethoven/IBeethovenVault.sol";

/// @title Abstract contract for Beethoven strategy implementation
/// @author OlegN
abstract contract BeethovenBase is StrategyBase {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "BeethovenBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract is changed
  string public constant VERSION = "1.0.1";
  /// @dev 10% buyback
  uint private constant _BUY_BACK_RATIO = 1000;
  /// @notice MasterChef rewards pool
  address public pool;
  /// @notice MasterChef rewards pool ID
  uint public poolId;
  /// @notice Beethoven vault
  IBeethovenVault public beethovenVault;

  /// @notice Beethoven Pool Id (token deposited to this pool in exchange of BPT)
  bytes32 public beethovenPoolId;

  /// @notice Used by auto compound to swap reward token to deposit token
  bytes32 public rewardToDepositPoolId;

  IAsset[] public poolTokens;

  /// @notice Token used for LP deposit. In balancer pool could contain up to 20 different tokens.
  /// We need to choose one to be used for deposit. Usually the most liquid one.
  address public depositToken;

  bool public useBeethovenSingleSwap = true;

  IBeethovenVault.FundManagement private fundManagementStruct;
  IBeethovenVault.SwapKind private _defaultSwapKind = IBeethovenVault.SwapKind.GIVEN_IN;

  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.BEETHOVEN;

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _pool,
    uint _poolId,
    address _beethovenVault,
    address _depositToken,
    bytes32 _beethovenPoolId,
    bytes32 _rewardToDepositPoolId

  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    require(_pool != address(0), "SSAB: Zero address pool");
    pool = _pool;
    poolId = _poolId;
    beethovenVault = IBeethovenVault(_beethovenVault);
    depositToken = _depositToken;
    fundManagementStruct = IBeethovenVault.FundManagement(address(this), false, payable(address(this)), false);
    beethovenPoolId = _beethovenPoolId;
    rewardToDepositPoolId = _rewardToDepositPoolId;
    setupPullTokens();
  }

  // ************* VIEWS *******************

  /// @notice Strategy balance in the MasterChef pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public virtual override view returns (uint) {
    (uint _amount,) = IBeethovenxChef(pool).userInfo(poolId, address(this));
    return _amount;
  }

  /// @notice Return approximately amount of reward tokens ready to claim in MasterChef pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return Array with amounts ready to claim
  function readyToClaim() external view override returns (uint[] memory) {
    uint[] memory toClaim = new uint[](1);
    toClaim[0] = IBeethovenxChef(pool).pendingBeets(poolId, address(this));
    return toClaim;
  }

  /// @notice TVL of the underlying in the MasterChef pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view virtual override returns (uint) {
    return IERC20(_underlyingToken).balanceOf(pool);
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    address[] memory token = new address[](poolTokens.length);
    for (uint i = 0; i < poolTokens.length; i++) {
      token[i] = address(poolTokens[i]);
    }
    return token;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  function doHardWork() external onlyNotPausedInvesting virtual override restricted {
    investAllUnderlying();
    IBeethovenxChef(pool).harvest(poolId, address(this));
    liquidateReward();
  }

  // @dev enable or disable beethoven for single swaps (use forwarder if disabled)
  function isUseBeethovenSingleSwap(bool isEnabled) external restricted {
    useBeethovenSingleSwap = isEnabled;
  }

  // ************ INTERNAL LOGIC IMPLEMENTATION **************************

  /// @dev Deposit underlying to MasterChef pool
  /// @param amount Deposit amount
  function depositToPool(uint amount) internal virtual override {
    IERC20(_underlyingToken).safeApprove(pool, 0);
    IERC20(_underlyingToken).safeApprove(pool, amount);
    IBeethovenxChef(pool).deposit(poolId, amount, address(this));
  }

  /// @dev Withdraw underlying from MasterChef pool
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint amount) internal virtual override {
     IBeethovenxChef(pool).withdrawAndHarvest(poolId, amount, address(this));
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal virtual override {
    IBeethovenxChef(pool).emergencyWithdraw(poolId, address(this));
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override {
    autoCompoundBalancer();
    liquidateRewardSilently();
  }

  /// @dev Concert pool tokens from IERC20[] to IAsset[]
  function setupPullTokens() internal {
    (IERC20[] memory tokens,,) = beethovenVault.getPoolTokens(beethovenPoolId);
    IAsset[] memory tokenAssets = new IAsset[](tokens.length);
    for (uint i = 0; i < tokens.length; i++) {
      tokenAssets[i] = IAsset(address(tokens[i]));
    }
    poolTokens = tokenAssets;
  }

  /// @dev Liquidate rewards, buy assets and add to beethoven pool
  function autoCompoundBalancer() internal {
    for (uint i = 0; i < _rewardTokens.length; i++) {
      uint amount = rewardBalance(i);
      if (amount != 0) {
        uint toCompound = amount * (_BUY_BACK_DENOMINATOR - _buyBackRatio) / _BUY_BACK_DENOMINATOR;
        address rt = _rewardTokens[i];
        rewardToUnderlying(rt, toCompound);
        depositToPool(underlyingBalance());
      }
    }
  }

  /// @dev swap reward token to underlying using Beethoven pool
  function rewardToUnderlying(address rewardToken, uint toCompound) internal{
    if (toCompound == 0) {
      return;
    }
    uint tokensToDeposit = toCompound;
    if (rewardToken != depositToken) {
      if (useBeethovenSingleSwap){
        balancerSwap(rewardToDepositPoolId, rewardToken, depositToken, toCompound);
      }else{
        forwarderSwap(rewardToken, depositToken, toCompound);
      }
      tokensToDeposit = IERC20(depositToken).balanceOf(address (this));
    }
    balancerJoin(beethovenPoolId, depositToken, tokensToDeposit);
  }

  /// @dev swap _tokenIn to _tokenOut using pool identified by _poolId
  function balancerSwap(bytes32 _poolId, address _tokenIn, address _tokenOut, uint _amountIn) internal{
    IBeethovenVault.SingleSwap memory singleSwapData = IBeethovenVault.SingleSwap(
      _poolId,
      _defaultSwapKind,
      IAsset(_tokenIn),
      IAsset(_tokenOut),
      _amountIn,
      ""
    );
    IERC20(_tokenIn).safeApprove(address(beethovenVault), _amountIn);
    uint amount = beethovenVault.swap(singleSwapData, fundManagementStruct, 1, block.timestamp);
    require(amount != 0, "CS: Liquidated zero");
  }

  /// @dev swap _tokenIn to _tokenOut using pool identified by _poolId
  function forwarderSwap( address _tokenIn, address _tokenOut, uint _amountIn) internal {
    address forwarder = IController(controller()).feeRewardForwarder();
    IERC20(_tokenIn).safeApprove(forwarder, 0);
    IERC20(_tokenIn).safeApprove(forwarder, _amountIn);
    uint amount = IFeeRewardForwarder(forwarder).liquidate(_tokenIn, _tokenOut, _amountIn);
    require(amount != 0, "CS: Liquidated zero");
  }

  /// @dev Join to the given pool (exchange tokenIn to underlying BPT)
  function balancerJoin(bytes32 _poolId, address _tokenIn, uint _amountIn) internal {
    uint[] memory amounts = new uint[](poolTokens.length);
    for (uint i = 0; i < amounts.length; i++) {
      amounts[i] = address(poolTokens[i]) == _tokenIn ? _amountIn : 0;
    }
    bytes memory userData = abi.encode(1, amounts, 1);
    IBeethovenVault.JoinPoolRequest memory request = IBeethovenVault.JoinPoolRequest(
      poolTokens,
      amounts,
      userData,
      false
    );

    IERC20(depositToken).safeApprove(address(beethovenVault), 0);
    IERC20(depositToken).safeApprove(address(beethovenVault), _amountIn);
    beethovenVault.joinPool(_poolId, address(this), address(this), request);
  }

  function platform() external override pure returns (IStrategy.Platform) {
    return _PLATFORM;
  }

}
