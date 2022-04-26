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

import "../ProxyStrategyBase.sol";
import "../../SlotsLib.sol";
import "../../../third_party/balancer/IBVault.sol";

/// @title Base contract for sending assets to bridge and receive rewards
/// @author belbix
abstract contract BalBridgedStakingStrategyBase is ProxyStrategyBase {
  using SafeERC20 for IERC20;
  using SlotsLib for bytes32;

  // --------------------- CONSTANTS -------------------------------
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "BalBridgedStakingStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev 20% buybacks
  uint256 private constant _BUY_BACK_RATIO = 20_00;
  address internal constant _WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
  address internal constant _BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;
  address private constant _BAL_ETH_USDC_WMATIC_POOL = 0x0297e37f1873D2DAb4487Aa67cD56B58E2F27875;
  bytes32 private constant _BAL_ETH_USDC_WMATIC_POOL_ID = 0x0297e37f1873d2dab4487aa67cd56b58e2f27875000100000000000000000002;
  bytes32 private constant _BAL_ETH_POOL_ID = 0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f000200000000000000000426;
  address private constant _BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
  bytes32 internal constant _SENDER_KEY = bytes32(uint256(keccak256("s.sender")) - 1);
  bytes32 internal constant _INVESTED_KEY = bytes32(uint256(keccak256("s.invested")) - 1);


  /// @notice Initialize contract after setup it as proxy implementation
  function initializeStrategy(
    address controller_,
    address underlying_,
    address vault_,
    address[] memory rewardTokens_,
    address sender_
  ) public initializer {
    _SENDER_KEY.set(sender_);
    ProxyStrategyBase.initializeStrategyBase(
      controller_,
      underlying_,
      vault_,
      rewardTokens_,
      _BUY_BACK_RATIO
    );
  }


  // --------------------------------------------

  function balSender() external view returns (address) {
    return _SENDER_KEY.getAddress();
  }

  /// @dev Transfer BPT tokens to sender
  function _sendToBridge() internal {
    IERC20 u = IERC20(_underlying());
    uint balance = u.balanceOf(address(this));
    if (balance > 0) {
      // save BPT balance that was transfer to sender
      _INVESTED_KEY.set(_INVESTED_KEY.getUint() + balance);
      u.safeTransfer(_SENDER_KEY.getAddress(), balance);
    }
  }

  // --------------------------------------------

  /// @notice Return only pool balance. Assume that we ALWAYS invest on vault deposit action
  function investedUnderlyingBalance() external override view returns (uint) {
    return _rewardPoolBalance();
  }

  /// @dev Returns underlying balance in the pool
  function _rewardPoolBalance() internal override view returns (uint256) {
    return _INVESTED_KEY.getUint();
  }

  /// @dev Collect profit and do something useful with them
  function doHardWork() external override {

    // we should receive periodically BAL tokens from mainnet
    // wrap them into vault shares and send as rewards to the vault
    liquidateReward();
  }

  uint private constant _WETH_BPT_RATIO = 20;

  function liquidateReward() internal override {
    uint balBalance = IERC20(_BAL).balanceOf(address(this));

    // threshold 1 BAL
    if (balBalance < 1 * (10 ** 18)) {
      return;
    }


    uint toBPT = balBalance * (_BUY_BACK_DENOMINATOR - _buyBackRatio()) / _BUY_BACK_DENOMINATOR;
    uint balForPS = balBalance - toBPT;
    uint balForWethPart = toBPT * 20 / 100;
    uint balForJoin = toBPT - balForWethPart;
    uint balForSwap = balForWethPart + balForPS;

    // -------------- SWAP BAL TO WETH PARTIALLY ------------


    IERC20(_BAL).safeApprove(_BALANCER_VAULT, 0);
    IERC20(_BAL).safeApprove(_BALANCER_VAULT, balForSwap);

    IBVault(_BALANCER_VAULT).swap(
      IBVault.SingleSwap({
    poolId : _BAL_ETH_USDC_WMATIC_POOL_ID,
    kind : IBVault.SwapKind.GIVEN_IN,
    assetIn : IAsset(_BAL),
    assetOut : IAsset(_WETH),
    amount : balForSwap,
    userData : bytes("")
    }),
      IBVault.FundManagement({
    sender : address(this),
    fromInternalBalance : false,
    recipient : payable(address(this)),
    toInternalBalance : false
    }),
      0,
      block.timestamp
    );

    // use the same proportion for join
    // don't care about slippage lost
    uint wethForJoin = IERC20(_WETH).balanceOf(address(this)) * balForWethPart / balForSwap;

    // -------------- INVEST TO BALANCER POOL ------------

    IAsset[] memory joinAssets = new  IAsset[](2);
    joinAssets[0] = IAsset(_WETH);
    joinAssets[1] = IAsset(_BAL);

    // don't care about slippage a lot
    uint[] memory maxAmounts = new uint[](2);
    maxAmounts[0] = wethForJoin * 10;
    maxAmounts[1] = balForJoin * 10;

    uint[] memory amounts = new uint[](2);
    amounts[0] = wethForJoin;
    amounts[1] = balForJoin;

    bytes memory userData = abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amounts, 0);

    IERC20(_WETH).safeApprove(_BALANCER_VAULT, 0);
    IERC20(_WETH).safeApprove(_BALANCER_VAULT, wethForJoin);
    IERC20(_BAL).safeApprove(_BALANCER_VAULT, 0);
    IERC20(_BAL).safeApprove(_BALANCER_VAULT, balForJoin);

    IBVault(_BALANCER_VAULT).joinPool(
      _BAL_ETH_POOL_ID,
      address(this),
      address(this),
      IBVault.JoinPoolRequest({
    assets : joinAssets,
    maxAmountsIn : maxAmounts,
    userData : userData,
    fromInternalBalance : false
    })
    );

    // -------------- INVEST TO VAULT ------------

    // all wrapped tokens got to rewards
    uint toVault = IERC20(_underlying()).balanceOf(address(this));

    if (toVault != 0) {
      // wrap BPT tokens to tetuBAL
      ISmartVault sv = ISmartVault(_vault());
      IERC20(_underlying()).safeApprove(_vault(), 0);
      IERC20(_underlying()).safeApprove(_vault(), toVault);
      // make sure that we not call doHardWork again in the vault during investment process
      sv.depositAndInvest(toVault);
      uint shareBalance = IERC20(address(sv)).balanceOf(address(this));
      // add deposited amount to vault rewards
      IERC20(address(sv)).safeApprove(_vault(), 0);
      IERC20(address(sv)).safeApprove(_vault(), shareBalance);
      sv.notifyTargetRewardAmount(address(sv), shareBalance);
    }

    // -------------- LIQUIDATE PLATFORM PART ------------

    // we should have a part of swapped amount in WETH
    address rt = _WETH;
    address forwarder = IController(_controller()).feeRewardForwarder();
    uint targetTokenEarnedTotal = 0;
    uint amount = IERC20(rt).balanceOf(address(this));
    if (amount != 0) {
      IERC20(rt).safeApprove(forwarder, 0);
      IERC20(rt).safeApprove(forwarder, amount);
      // it will sell reward token to Target Token and distribute it to SmartVault and PS
      targetTokenEarnedTotal = IFeeRewardForwarder(forwarder).distribute(amount, rt, _vault());
    }

    if (targetTokenEarnedTotal > 0) {
      IBookkeeper(IController(_controller()).bookkeeper()).registerStrategyEarned(targetTokenEarnedTotal);
    }
  }

  /// @dev Stake underlying to the pool with maximum lock period
  function depositToPool(uint256 amount) internal override {
    if (amount > 0) {
      _sendToBridge();
    }
  }

  /// @dev We will not able to withdraw from the pool
  function withdrawAndClaimFromPool(uint256) internal pure override {
    revert("BBSS: Withdraw forbidden");
  }

  /// @dev Not able to withdraw in any form
  function emergencyWithdrawFromPool() internal pure override {
    revert("BBSS: Withdraw forbidden");
  }

  /// @dev No claimable tokens
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    return toClaim;
  }

  /// @dev Assume that sent tokes is the whole pool balance
  function poolTotalAmount() external view override returns (uint256) {
    return _INVESTED_KEY.getUint();
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.BALANCER;
  }

}
