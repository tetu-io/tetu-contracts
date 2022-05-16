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

// TODO @belbix: how to name/split different third-party contracts with same names?
// for now I've placed last aave 0.8.10 contracts to v10 folder with original structure
import "../../../third_party/aave/v10/interfaces/IPool.sol";
import "../../../third_party/aave/IAaveIncentivesController.sol";
import "../StrategyBase.sol";

/// @title Base Aave strategy implementation
/// @author bogdoslav
contract AaveStrategyBase is StrategyBase {
  using SafeERC20 for IERC20;

  // ************ VARIABLES **********************
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "AaveBase";
  Platform public constant override platform = Platform.AAVE_LEND;
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev 10% buyback
  uint private constant _BUY_BACK_RATIO = 10_00;
  uint private constant _UINT_MAX = type(uint).max;
  uint16 private constant _aaveReferralCode = 0;

  IPool public aavePool;
  IAaveIncentivesController private aaveController;
  // Aave returns aToken - overflying token of the asset (underlying)
  address public aToken;

  error ABWrongUnderlying();
  error ABZeroATokenAddress();
  error ABZeroAaveController();

  /// @notice Contract constructor using on strategy implementation
  /// @dev The implementation should check each parameter
  /// @param controller_ Controller address
  /// @param vault_ SmartVault address that will provide liquidity
  /// @param underlying_ Underlying token address
  /// @param rewardTokens_ Reward tokens that the strategy will farm
  /// @param aavePool_ Aave pool address
  constructor(
    address controller_,
    address vault_,
    address underlying_,
    address[] memory rewardTokens_,
    address aavePool_,
    address aaveController_
  ) StrategyBase(controller_, underlying_, vault_, rewardTokens_, _BUY_BACK_RATIO) {
    if (aaveController_ == address(0)) revert ABZeroAaveController();
    aaveController = IAaveIncentivesController(aaveController_);

    DataTypes.ReserveConfigurationMap memory reserveConfig = IPool(aavePool_).getConfiguration(underlying_);
    if (reserveConfig.data == 0) revert ABWrongUnderlying();
    aavePool = IPool(aavePool_);

    DataTypes.ReserveData memory reserveData = aavePool.getReserveData(underlying_);
    if (reserveData.aTokenAddress == address(0)) revert ABZeroATokenAddress();
    aToken = reserveData.aTokenAddress;
  }

  function rewardPoolBalance() public override view returns (uint) {
    return IERC20(aToken).balanceOf(address(this));
  }

  /// @dev Deposit (supply) underlying to aave pool
  /// @param amount Deposit amount
  function depositToPool(uint amount) internal override {
    IERC20(_underlyingToken).approve(address(aavePool), amount);
    aavePool.supply(_underlyingToken, amount, address(this), _aaveReferralCode);
  }

  /// @dev Withdraw underlying from aave pool
  /// @param amount withdraw amount
  function withdrawAndClaimFromPool(uint amount) internal override {
    _claimReward();
    IERC20(aToken).approve(address(aavePool), amount);
    aavePool.withdraw(_underlyingToken, amount, address(this));
  }

  /// @dev Emergency withdraw all underlying from aave pool
  function emergencyWithdrawFromPool() internal override {
    IERC20(aToken).approve(address(aavePool), _UINT_MAX);
    aavePool.withdraw(_underlyingToken, _UINT_MAX, address(this));
  }

  /// @dev Do something useful with farmed rewards
  function liquidateReward() internal override virtual{
    liquidateRewardDefault();
  }

  /// @notice TVL of the underlying in the aToken contract
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint) {
    // TODO @oleg, @belbix, do we need to add to this Total borrowed amount?
    // because balanceOf = Total supplied - Total borrowed
    // https://app.aave.com/reserve-overview/?underlyingAsset=0x53e0bca35ec356bd5dddfebbd1fc0fd03fabad39&marketName=proto_polygon_v3
    return IERC20(_underlyingToken).balanceOf(aToken);
  }

  /// @dev Claim distribution rewards
  function _claimReward() internal {
    address[] memory addresses = new address[](1);
    addresses[0] = aToken;
    aaveController.claimRewards(addresses, type(uint).max, address(this));
  }

  /// @notice Return approximately amount of reward tokens ready to claim in AAVE Lending pool
  /// @dev Don't use it in any internal logic, only for statistical purposes
  /// @return rewards Array with amounts ready to claim
  function readyToClaim() external view override returns (uint[] memory rewards) {
    rewards = new uint[](1);
    rewards[0] = aaveController.getUserUnclaimedRewards(address(this));
  }

  /// @notice Claim rewards from external project, autocompound and
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    _claimReward();
    autocompound();
    investAllUnderlying();
    liquidateReward();
  }

  /// @notice Assets addresses of underlying tokens need to investing
  /// @return addresses rewards Array with amounts ready to claim
  function assets() external override view returns (address[] memory addresses) {
    addresses = new address[](1);
    addresses[0] = _underlyingToken;
  }

}
