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
contract BeethovenFDBase is BeethovenBase {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  uint private constant _PRECISION = 10 ** 18;

  /// @notice token to get extra rewards by wrapping BPT tokens
  address fBeetsToken;

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
    bytes32 _rewardToDepositPoolId,
    address _fBeetsToken

  ) BeethovenBase(
    _controller,
    _vault,
    _underlying,
    __rewardTokens,
    _pool,
    _poolId,
    _beethovenVault,
    _depositToken,
    _beethovenPoolId,
    _rewardToDepositPoolId
  ){
    fBeetsToken = _fBeetsToken;
  }

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
    return underlyingForFBeets(_fBeetsAmount);
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
    IERC20(_underlyingToken).safeApprove(fBeetsToken, 0);
    IERC20(_underlyingToken).safeApprove(fBeetsToken, amount);
    IFBeets(fBeetsToken).enter(amount);
    IERC20(fBeetsToken).safeApprove(pool, 0);
    IERC20(fBeetsToken).safeApprove(pool, balanceFBits());
    IBeethovenxChef(pool).deposit(poolId, balanceFBits(), address(this));
  }

  /// @dev Withdraw fBits from MasterChef pool and unwrap underlying
  /// @param amount Deposit amount
  function withdrawAndClaimFromPool(uint amount) internal override {
    uint toWithdrawFBits = fBeetsForToken(amount - underlyingBalance());
    if (toWithdrawFBits > 0) {
      // withdraw fBeets
      IBeethovenxChef(pool).withdrawAndHarvest(poolId, toWithdrawFBits, address(this));
      IFBeets(fBeetsToken).leave(balanceFBits());
    }
  }

  /// @dev Exit from external project without caring about rewards
  ///      For emergency cases only!
  function emergencyWithdrawFromPool() internal override {
    IBeethovenxChef(pool).emergencyWithdraw(poolId, address(this));
    IFBeets(fBeetsToken).leave(balanceFBits());
  }

  /// @notice shows balance of fBeets tokens owned by strategy
  function balanceFBits() public view returns (uint) {
    return IERC20(fBeetsToken).balanceOf(address(this));
  }

  /// @notice calculates amount of fBeets which correspondents _amount of beets tokens.
  function fBeetsForToken(uint amount) internal view returns (uint) {
    uint result = amount * _PRECISION / exchangeRate();
    // need to avoid rounding issues
    if (result > 1) {
      return result;
    }
    return 0;
  }

  /// @notice calculates amount of beets tokens which correspondents _amount of fBeets tokens.
  function underlyingForFBeets(uint amount) internal view returns (uint) {
    uint result = amount * exchangeRate() / _PRECISION;
    // need to avoid rounding issues
    if (result > 1) {
      return result;
    }
    return 0;
  }

  /// @notice calculates exchange rate beets to fBeets
  function exchangeRate() internal view returns (uint) {
    return IERC20(_underlyingToken).balanceOf(fBeetsToken) * _PRECISION / (IERC20(fBeetsToken).totalSupply());
  }

}
