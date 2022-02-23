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

/// @title Strategy for autocompound our vaults
/// @author belbix
abstract contract TetuSelfFarmBase is ProxyStrategyBase {
  using SafeERC20 for IERC20;

  // --------------------- CONSTANTS -------------------------------
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "TetuSelfFarmBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  // we don't collect additional fees on self farm
  uint private constant _BUY_BACK_RATIO = 0;

  bytes32 internal constant _FARMABLE_VAULT_KEY = bytes32(uint(keccak256("s.farmable_vault")) - 1);

  // ------------------- VARIABLES ---------------------------------
  // should be only maps/arrays, or use storage contract

  mapping(bytes32 => address) private strategyAddressStorage;

  /// @notice Initialize contract after setup it as proxy implementation
  function initializeStrategy(
    address _controller,
    address _vault,
    address __farmableVault
  ) public initializer {
    _setStrategyAddress(_FARMABLE_VAULT_KEY, __farmableVault);
    ProxyStrategyBase.initializeStrategyBase(
      _controller,
      _farmableVault().underlying(),
      _vault,
      _farmableVault().rewardTokens(),
      _BUY_BACK_RATIO
    );
    IERC20(_underlying()).safeApprove(__farmableVault, type(uint).max);
  }

  /// @dev Returns underlying amount under control
  function _rewardPoolBalance() internal override view returns (uint) {
    return _farmableVault().underlyingBalanceWithInvestmentForHolder(address(this));
  }

  /// @dev Collect profit and do something useful with them
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    // invest all for avoid users funds liquidation
    _investAllUnderlying();
    // claim all rewards
    _farmableVault().getAllRewards();
    liquidateReward();
  }

  /// @dev Stake underlying into farmable vault
  function depositToPool(uint amount) internal override {
    if (amount > 0) {
      // allowance should be setup in init
      _farmableVault().depositAndInvest(amount);
    }
  }

  /// @dev Withdraw underlying
  function withdrawAndClaimFromPool(uint underlyingAmount) internal override {
    ISmartVault sv = _farmableVault();
    uint numberOfShares = underlyingAmount * sv.underlyingUnit() / sv.getPricePerFullShare();
    numberOfShares = Math.min(numberOfShares, IERC20(address(sv)).balanceOf(address(this)));
    if (numberOfShares > 0) {
      sv.withdraw(numberOfShares);
    }
  }

  /// @dev In emergency case QiDAO can activate this function
  function emergencyWithdrawFromPool() internal override {
    _farmableVault().exit();
  }

  function liquidateReward() internal override {
    address forwarder = IController(_controller()).feeRewardForwarder();
    address[] memory rts = _farmableVault().rewardTokens();
    for (uint i = 0; i < rts.length; i++) {
      address rt = rts[i];
      uint toCompound = IERC20(rt).balanceOf(address(this));
      if (toCompound != 0) {
        if (rt == IController(_controller()).psVault()) {
          ISmartVault(rt).exit();
          rt = ISmartVault(rt).underlying();
          toCompound = IERC20(rt).balanceOf(address(this));
        }
        IERC20(rt).safeApprove(forwarder, 0);
        IERC20(rt).safeApprove(forwarder, toCompound);
        IFeeRewardForwarder(forwarder).liquidate(rt, _underlying(), toCompound);
      }
    }
  }

  /// @dev No claimable tokens
  function readyToClaim() external view override returns (uint[] memory) {
    ISmartVault sv = _farmableVault();
    address[] memory rts = sv.rewardTokens();
    uint[] memory toClaim = new uint[](rts.length);

    for (uint i; i < rts.length; i++) {
      toClaim[i] = sv.earned(rts[i], address(this));
    }
    return toClaim;
  }

  /// @dev Return full farmable vault TVL
  function poolTotalAmount() external view override returns (uint) {
    return _farmableVault().underlyingBalanceWithInvestment();
  }

  function farmableVault() external view returns (address) {
    return address(_farmableVault());
  }

  function _farmableVault() internal view returns (ISmartVault) {
    return ISmartVault(_getStrategyAddress(_FARMABLE_VAULT_KEY));
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.TETU_SF;
  }

  // assets should reflect underlying tokens need to investing
  function assets() external override view returns (address[] memory) {
    return IStrategy(_farmableVault().strategy()).assets();
  }

  // --------------------- STORAGE FUNCTIONS -------------------------
  function _setStrategyAddress(bytes32 key, address _value) private {
    strategyAddressStorage[key] = _value;
  }

  function _getStrategyAddress(bytes32 key) private view returns (address) {
    return strategyAddressStorage[key];
  }
}
