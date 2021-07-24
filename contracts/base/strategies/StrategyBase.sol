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

import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interface/IStrategy.sol";
import "../governance/Controllable.sol";
import "../interface/IFeeRewardForwarder.sol";
import "../interface/IBookkeeper.sol";

abstract contract StrategyBase is IStrategy, Controllable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  // *********************** EVENTS *******************
  event DistributeLog(
    address indexed token,
    uint256 profitAmount,
    uint256 toPsAmount,
    uint256 toVaultAmount,
    uint256 timestamp)
  ;

  //************************ VARIABLES **************************
  address internal _underlyingToken;
  address internal _smartVault;
  mapping(address => bool) internal _unsalvageableTokens;
  // we always use 100% buybacks but keep this variable to further possible changes
  uint256 internal _buyBackRatio;
  // When this flag is true, the strategy will not be able to invest. But users should be able to withdraw.
  bool public override pausedInvesting = false;
  address[] internal _rewardTokens;


  //************************ MODIFIERS **************************

  modifier restricted() {
    require(msg.sender == _smartVault
    || msg.sender == address(controller())
      || isGovernance(msg.sender),
      "forbidden");
    _;
  }

  // This is only used in `investAllUnderlying()`
  // The user can still freely withdraw from the strategy
  modifier onlyNotPausedInvesting() {
    require(!pausedInvesting, "paused");
    _;
  }

  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    uint256 _bbRatio
  ) {
    Controllable.initializeControllable(_controller);
    _underlyingToken = _underlying;
    _smartVault = _vault;
    _rewardTokens = __rewardTokens;
    _buyBackRatio = _bbRatio;

    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      _unsalvageableTokens[_rewardTokens[i]] = true;
    }
    _unsalvageableTokens[_underlying] = true;
  }

  // *************** VIEWS ****************

  function rewardTokens() public view override returns (address[] memory) {
    return _rewardTokens;
  }

  function underlying() external view override returns (address) {
    return _underlyingToken;
  }

  function underlyingBalance() public view override returns (uint256) {
    return IERC20(_underlyingToken).balanceOf(address(this));
  }

  function vault() external view override returns (address) {
    return _smartVault;
  }

  function unsalvageableTokens(address token) external override view returns (bool) {
    return _unsalvageableTokens[token];
  }

  function buyBackRatio() external view override returns (uint256) {
    return _buyBackRatio;
  }

  function rewardBalance(uint256 rewardTokenIdx) public view returns (uint256) {
    return IERC20(_rewardTokens[rewardTokenIdx]).balanceOf(address(this));
  }

  /*
   * Return underlying balance + balance in the reward pool
   */
  function investedUnderlyingBalance() external override view returns (uint256) {
    // Adding the amount locked in the reward pool and the amount that is somehow in this contract
    // both are in the units of "underlying"
    // The second part is needed because there is the emergency exit mechanism
    // which would break the assumption that all the funds are always inside of the reward pool
    return rewardPoolBalance().add(underlyingBalance());
  }

  //******************** GOVERNANCE *******************

  /*
 *   In case there are some issues discovered about the pool or underlying asset
 *   Governance can exit the pool properly
 *   The function is only used for emergency to exit the pool
 */
  function emergencyExit() external override onlyControllerOrGovernance {
    emergencyExitRewardPool();
    pausedInvesting = true;
  }

  /*
*   Resumes the ability to invest into the underlying reward pools
*/
  function continueInvesting() external override onlyControllerOrGovernance {
    pausedInvesting = false;
  }

  /*
 * Governance or Controller can claim coins that are somehow transferred into the contract
 * Note that they cannot come in take away coins that are used and defined in the strategy itself
 */
  function salvage(address recipient, address token, uint256 amount)
  external override onlyController {
    // To make sure that governance cannot come in and take away the coins
    require(!_unsalvageableTokens[token], "not salvageable");
    IERC20(token).safeTransfer(recipient, amount);
  }

  /*
 *   Withdraws all the asset to the vault
 */
  function withdrawAllToVault() external override restricted {
    exitRewardPool();
    IERC20(_underlyingToken).safeTransfer(_smartVault, underlyingBalance());
  }

  /*
 *   Withdraws some asset to the vault
 */
  function withdrawToVault(uint256 amount) external override restricted {
    // Typically there wouldn't be any amount here
    // however, it is possible because of the emergencyExit
    if (amount > underlyingBalance()) {
      // While we have the check above, we still using SafeMath below
      // for the peace of mind (in case something gets changed in between)
      uint256 needToWithdraw = amount.sub(underlyingBalance());
      uint256 toWithdraw = Math.min(rewardPoolBalance(), needToWithdraw);
      withdrawAndClaimFromPool(toWithdraw);
    }

    IERC20(_underlyingToken).safeTransfer(_smartVault, amount);
  }

  /*
   *   Stakes everything the strategy holds into the reward pool
   */
  function investAllUnderlying() public override restricted onlyNotPausedInvesting {
    // this check is needed, because most of the SNX reward pools will revert if
    // you try to stake(0).
    if (underlyingBalance() > 0) {
      depositToPool(underlyingBalance());
    }
  }

  // ***************** INTERNAL ************************

  function exitRewardPool() internal {
    uint256 bal = rewardPoolBalance();
    if (bal != 0) {
      withdrawAndClaimFromPool(bal);
    }
  }

  function emergencyExitRewardPool() internal {
    uint256 bal = rewardPoolBalance();
    if (bal != 0) {
      emergencyWithdrawFromPool();
    }
  }

  function distributeRewards(uint256 _rewardBalance, address _rewardToken) internal {
    if (_rewardBalance > 0) {

      uint256 profitSharingNumerator = IController(controller()).psNumerator();
      uint256 profitSharingDenominator = IController(controller()).psDenominator();

      uint256 toPsAmount = _rewardBalance.mul(profitSharingNumerator).div(profitSharingDenominator);
      uint256 toVaultAmount = _rewardBalance.sub(toPsAmount);
      address forwarder = IController(controller()).feeRewardForwarder();
      emit DistributeLog(_rewardToken, _rewardBalance, toPsAmount, toVaultAmount, block.timestamp);

      IERC20(_rewardToken).safeApprove(forwarder, 0);
      IERC20(_rewardToken).safeApprove(forwarder, _rewardBalance);
      uint256 targetTokenEarned = 0;
      if (toPsAmount > 0) {
        targetTokenEarned = targetTokenEarned.add(
          IFeeRewardForwarder(forwarder).notifyPsPool(_rewardToken, toPsAmount)
        );
      }
      if (toVaultAmount > 0) {
        targetTokenEarned = targetTokenEarned.add(
          IFeeRewardForwarder(forwarder).notifyCustomPool(_rewardToken, _smartVault, toVaultAmount)
        );
      }
      if (targetTokenEarned > 0) {
        IBookkeeper(IController(controller()).bookkeeper()).registerStrategyEarned(targetTokenEarned);
      }
    } else {
      emit DistributeLog(_rewardToken, 0, 0, 0, block.timestamp);
    }
  }

  function liquidateRewardDefault() internal {
    for (uint256 i = 0; i < _rewardTokens.length; i++) {
      // it will sell reward token to Target Token and distribute it to SmartVault and PS
      distributeRewards(rewardBalance(i), _rewardTokens[i]);
    }
  }

  //******************** VIRTUAL *********************
  function doHardWork() external virtual override;

  function rewardPoolBalance() public virtual override view returns (uint256 bal);

  //slither-disable-next-line dead-code
  function depositToPool(uint256 amount) internal virtual;

  //slither-disable-next-line dead-code
  function withdrawAndClaimFromPool(uint256 amount) internal virtual;

  //slither-disable-next-line dead-code
  function emergencyWithdrawFromPool() internal virtual;

  //slither-disable-next-line dead-code
  function liquidateReward() internal virtual;

}
