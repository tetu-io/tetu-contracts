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

/// @title Strategy for autocompound tetuQi vault
/// @author belbix
abstract contract XQiSelfFarmBase is ProxyStrategyBase {
  using SafeERC20 for IERC20;

  // --------------------- CONSTANTS -------------------------------
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "XQiSelfFarmBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  // we don't collect additional fees on self farm
  uint private constant _BUY_BACK_RATIO = 0;

  /// @notice Initialize contract after setup it as proxy implementation
  function initializeStrategy(
    address _controller,
    address _vault,
    address _tetuQiVault
  ) public initializer {
    ProxyStrategyBase.initializeStrategyBase(
      _controller,
      _tetuQiVault,
      _vault,
      ISmartVault(_tetuQiVault).rewardTokens(),
      _BUY_BACK_RATIO
    );
  }

  /// @dev Returns underlying amount under control
  function _rewardPoolBalance() internal override pure returns (uint) {
    // we do not deposit tetuQi somewhere
    return 0;
  }

  /// @dev Collect profit and do something useful with them
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    // claim all rewards
    ISmartVault(_underlying()).getAllRewards();
    liquidateReward();
  }

  /// @dev noop
  function depositToPool(uint amount) internal override {
    // noop
  }

  /// @dev noop
  function withdrawAndClaimFromPool(uint underlyingAmount) internal override {
    // noop
  }

  /// @dev noop
  function emergencyWithdrawFromPool() internal override {
    // noop
  }

  function liquidateReward() internal override {
    ISmartVault tetuQi = ISmartVault(_underlying());
    address[] memory rts = tetuQi.rewardTokens();
    address qi = tetuQi.underlying();

    address forwarder = IController(_controller()).feeRewardForwarder();
    // it should be xTETU and tetuQi tokens
    for (uint i = 0; i < rts.length; i++) {
      address rt = rts[i];
      if (rt == address(tetuQi)) {
        // no actions for tetuQi token
        continue;
      }
      uint amount = IERC20(rt).balanceOf(address(this));
      if (amount != 0) {
        // unwrap xTETU to TETU
        if (rt == IController(_controller()).psVault()) {
          ISmartVault(rt).exit();
          address tetu = ISmartVault(rt).underlying();
          amount = IERC20(tetu).balanceOf(address(this));
          rt = tetu;
        }

        // sell token to Qi token
        IERC20(rt).safeApprove(forwarder, 0);
        IERC20(rt).safeApprove(forwarder, amount);
        IFeeRewardForwarder(forwarder).liquidate(rt, qi, amount);

        // deposit Qi to tetuQi
        uint qiAmount = IERC20(qi).balanceOf(address(this));
        IERC20(qi).safeApprove(address(tetuQi), 0);
        IERC20(qi).safeApprove(address(tetuQi), qiAmount);
        tetuQi.depositAndInvest(qiAmount);
      }
    }
  }

  /// @dev No claimable tokens
  function readyToClaim() external view override returns (uint[] memory) {
    ISmartVault sv = ISmartVault(_underlying());
    address[] memory rts = sv.rewardTokens();
    uint[] memory toClaim = new uint[](rts.length);

    for (uint i; i < rts.length; i++) {
      toClaim[i] = sv.earned(rts[i], address(this));
    }
    return toClaim;
  }

  function poolTotalAmount() external pure override returns (uint) {
    return 0;
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.TETU_SF;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    address[] memory _assets = new address[](1);
    _assets[0] = _underlying();
    return _assets;
  }
}
