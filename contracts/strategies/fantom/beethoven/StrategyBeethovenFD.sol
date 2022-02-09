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

import "../../../third_party/beethoven/IFBeets.sol";
import "../../../base/strategies/beethoven/BeethovenBase.sol";

/**
  @author OlegN
  @title A strategy for The Fidelio Duetto beethoven pool
  @dev This strategy is using extra step (fBeets) to obtain extra rewards.
  It requires to add extra exchange rate logic
*/
contract StrategyBeethovenFD is BeethovenBase {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  uint private constant _PRECISION = 10 ** 18;

  // MASTER_CHEF
  address private constant _MASTER_CHEF = address(0x8166994d9ebBe5829EC86Bd81258149B87faCfd3);
  address private constant _BEETHOVEN_VAULT = address(0x20dd72Ed959b6147912C2e529F0a0C651c33c9ce);
  IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.BEETHOVEN;

  // rewards
  address private constant BEETS = address(0xF24Bcf4d1e507740041C9cFd2DddB29585aDCe1e);

  // fBeets token
  IFBeets _F_BEETS = IFBeets(0xfcef8a994209d6916EB2C86cDD2AFD60Aa6F54b1);

  address[] private poolRewards = [BEETS];

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    uint _poolId,
    address _depositToken,
    bytes32 _beethovenPoolId,
    bytes32 _rewardToDepositPoolId

  ) BeethovenBase(
    _controller,
    _vault,
    _underlying,
    poolRewards,
    _MASTER_CHEF,
    _poolId,
    _BEETHOVEN_VAULT,
    _depositToken,
    _beethovenPoolId,
    _rewardToDepositPoolId
  ){}

  /// @notice Claim rewards from external project and send them to FeeRewardForwarder
  /// @dev this method includes try..catch part because of IBeethovenxChef(pool).harvest could fail with the
  ///      low amount of rewards like 1. We could have such values due to rounding.
  function doHardWork() external override onlyNotPausedInvesting restricted {
    investAllUnderlying();
    try IBeethovenxChef(pool).harvest(poolId, address(this)){} catch {}
    liquidateReward();
  }

  /// @notice Strategy balance in the MasterChef pool
  /// @return bal Balance amount in underlying tokens
  function rewardPoolBalance() public override view returns (uint) {
    (uint _fBeetsAmount,) = IBeethovenxChef(pool).userInfo(poolId, address(this));
    uint _amount = fBeetsForToken(_fBeetsAmount);
    return _amount;
  }

  /// @notice TVL of the underlying in the MasterChef pool
  /// @dev Only for statistic
  /// @return Pool TVL
  function poolTotalAmount() external view override returns (uint) {
    return IERC20(_underlyingToken).balanceOf(pool) + rewardPoolBalance();
  }

  /// @dev Deposit wrapped underlying (fBeets) to MasterChef pool
  /// @param amount Deposit amount
  function depositToPool(uint amount) internal override {
    address fBeetsTokenAddress = address(_F_BEETS);
    IERC20(_underlyingToken).safeApprove(fBeetsTokenAddress, 0);
    IERC20(_underlyingToken).safeApprove(fBeetsTokenAddress, amount);
    _F_BEETS.enter(amount);
    IERC20(fBeetsTokenAddress).safeApprove(pool, 0);
    IERC20(fBeetsTokenAddress).safeApprove(pool, balanceFBits());
    IBeethovenxChef(pool).deposit(poolId, balanceFBits(), address(this));
  }

  /// @dev Withdraw fBits from MasterChef pool and unwrap underlying
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint amount) internal override {
    uint toWithdraw = underlyingForFBeets(amount - underlyingBalance());
    IBeethovenxChef(pool).withdrawAndHarvest(poolId, toWithdraw, address(this));
    _F_BEETS.leave(balanceFBits());
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    IBeethovenxChef(pool).emergencyWithdraw(poolId, address(this));
    _F_BEETS.leave(balanceFBits());
  }
  /// @notice shows balance of fBeets tokens owned by strategy
  function balanceFBits() public view returns (uint) {
    return IERC20(address(_F_BEETS)).balanceOf(address(this));
  }
  /// @notice calculates amount of fBeets which correspondents _amount of beets tokens.
  function fBeetsForToken(uint _amount) internal view returns (uint) {
    return _amount * exchangeRate() / _PRECISION;
  }

  /// @notice calculates amount of beets tokens which correspondents _amount of fBeets tokens.
  function underlyingForFBeets(uint _amount) internal view returns (uint) {
    return _amount * _PRECISION / exchangeRate();
  }

  /// @notice calculates exchange rate beets to fBeets
  function exchangeRate() internal view returns (uint) {
    address fBeetsTokenAddress = address(_F_BEETS);
    return IERC20(_underlyingToken).balanceOf(fBeetsTokenAddress) *
    _PRECISION / (IERC20(fBeetsTokenAddress).totalSupply());
  }
}
