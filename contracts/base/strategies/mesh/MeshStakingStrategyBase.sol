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
import "../../../third_party/IERC20Extended.sol";
import "../../../third_party/IDelegation.sol";
import "../../../third_party/mesh/IVotingMesh.sol";
import "../../../third_party/mesh/IPoolVoting.sol";

/// @title Base contract for Mesh stake into vMesh pool
/// @author olegn
abstract contract MeshStakingStrategyBase is ProxyStrategyBase {
  using SafeERC20 for IERC20;

  // --------------------- CONSTANTS -------------------------------
  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "MeshStakingStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.1";
  /// @dev 5% buybacks, 95% of vested Mesh should go to the targetRewardVault as rewards (not autocompound)
  uint256 private constant _BUY_BACK_RATIO = 500;
  uint256 private constant _MAX_LOCK_PERIOD = 1555200000;
  uint256 private constant _MESH_PRECISION = 1e18;
  IVotingMesh public constant vMesh = IVotingMesh(0x176b29289f66236c65C7ac5DB2400abB5955Df13);
  IPoolVoting public constant poolVoting = IPoolVoting(0x705b40Af8CeCd59406cF630Ab7750055c9b137B9);
  // should be only maps/arrays, or use storage contract
  mapping(bytes32 => uint) private strategyUintStorage;

  IUniswapV2Router02 public constant meshRouter = IUniswapV2Router02(0x10f4A785F458Bc144e3706575924889954946639);
  address private constant _MESH_TETU_MESH_PAIR_ADDRESS = address(0xcf40352253de7a0155d700a937Dc797D681c9867);
  address private constant _USDC_ADDRESS = address(0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174);
  address private constant _TETU_MESH = address(0xDcB8F34a3ceb48782c9f3F98dF6C12119c8d168a);
  uint256 private constant _TARGET_PPFS = 1e18;
  uint256 private _dust;
  address public targetRewardVault;
  address [] public rewardTokensFromVoting;

  /// @notice Initialize contract after setup it as proxy implementation
  function initializeStrategy(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address _targetRewardVault
  ) public initializer {
    ProxyStrategyBase.initializeStrategyBase(
      _controller,
      _underlying,
      _vault,
      __rewardTokens,
      _BUY_BACK_RATIO
    );
    targetRewardVault = _targetRewardVault;
  }

  event VotingAdded(address exchange, uint256 amount);
  event VotingRemoved(address exchange, uint256 amount);
  event VotingRemovedAll();
  event TargetRewardVaultUpdated(address newTargetRewardVault);

  // ------------------ GOV actions --------------------------

  /// @dev Manual withdraw for any emergency purposes
  function manualWithdraw() external restricted {
    IERC20(_underlying()).safeTransfer(_vault(), IERC20(_underlying()).balanceOf(address(this)));
  }

  function addVoting(address exchange, uint256 amount) external restricted {
    require(exchange != address(0), "Exchange address should be specified");
    poolVoting.addVoting(exchange, amount);
    emit VotingAdded(exchange, amount);
  }

  function removeVoting(address exchange, uint256 amount) external restricted {
    require(exchange != address(0), "Exchange address should be specified");
    poolVoting.removeVoting(exchange, amount);
    emit VotingRemoved(exchange, amount);
  }

  function removeAllVoting() external restricted {
    poolVoting.removeAllVoting();
    emit VotingRemovedAll();
  }

  function setTargetRewardVault(address _targetRewardVault) external restricted {
    targetRewardVault = _targetRewardVault;
    emit TargetRewardVaultUpdated(_targetRewardVault);
  }

  function updateRewardTokensFromVoting(address[] memory _rewardTokensFromVoting) external restricted {
    rewardTokensFromVoting = _rewardTokensFromVoting;
  }

  // --------------------------------------------

  /// @dev Returns MESH amount under control
  function _rewardPoolBalance() internal override view returns (uint256) {
    return vMesh.lockedMESH(address(this));
  }

  /// @dev In this version rewards are accumulated in this strategy
  function doHardWork() external onlyNotPausedInvesting override hardWorkers {
    vMesh.claimReward();
    poolVoting.claimRewardAll();
    _liquidateVotingRewards();
    uint256 underlyingBalance = IERC20(_underlying()).balanceOf(address(this));
    _liquidateReward(underlyingBalance - _dust);
  }

  function _liquidateVotingRewards() internal {
    uint256 i = 0;
    for (i; i < rewardTokensFromVoting.length; i++) {
      uint256 rtBalance = IERC20(rewardTokensFromVoting[i]).balanceOf(address(this));
      if (rtBalance > 0) {
        address[] memory route = new address[](2);
        route[0] = rewardTokensFromVoting[i];
        route[1] = _underlying();
        _meshSwap(rtBalance, route);
      }
    }
  }

  /// @dev Stake Mesh to vMesh
  function depositToPool(uint256 amount) internal override {
    uint256 currentPPFS = ISmartVault(_vault()).getPricePerFullShare();
    if (currentPPFS > _TARGET_PPFS) {
      amount = _adjustPPFS(amount);
    }

    if (amount > _MESH_PRECISION) {
      // lock on max period
      // mesh allows only integer values w/o precision e.g 1 mesh token
      uint256 roundedAmount = amount / _MESH_PRECISION;
      _dust = amount - roundedAmount * _MESH_PRECISION;
      IERC20(_underlying()).safeApprove(address(vMesh), 0);
      IERC20(_underlying()).safeApprove(address(vMesh), roundedAmount * _MESH_PRECISION);
      vMesh.lockMESH(roundedAmount, _MAX_LOCK_PERIOD);
      uint256 underlyingBalAfter = IERC20(_underlying()).balanceOf(address(this));
      uint256 rewardsEarned = underlyingBalAfter - _dust;
      if (rewardsEarned > 0) {
        _liquidateReward(rewardsEarned);
      }
    }
  }

  function _meshSwap(uint256 amount, address[] memory _route) internal {
    require(IERC20(_route[0]).balanceOf(address(this)) >= amount, "Not enough balance");
    IERC20(_route[0]).safeApprove(address(meshRouter), 0);
    IERC20(_route[0]).safeApprove(address(meshRouter), amount);
    meshRouter.swapExactTokensForTokens(
      amount,
      0,
      _route,
      address(this),
      block.timestamp
    );
  }

  function _getMeshReserves() internal view returns (uint256 tetuMeshReserves, uint256 meshReserves){
    tetuMeshReserves = IERC20(_TETU_MESH).balanceOf(_MESH_TETU_MESH_PAIR_ADDRESS);
    meshReserves = IERC20(_underlying()).balanceOf(_MESH_TETU_MESH_PAIR_ADDRESS);
  }


  function _liquidateReward(uint256 amount) internal {
    uint toBuybacks = (amount * _buyBackRatio() / _BUY_BACK_DENOMINATOR);
    uint toVault = amount - toBuybacks;
    if (toBuybacks != 0) {
      address[] memory route = new address[](2);
      route[0] = _underlying();
      route[1] = _USDC_ADDRESS;
      _meshSwap(toBuybacks, route);
      uint usdcAmount = IERC20(_USDC_ADDRESS).balanceOf(address(this));
      address forwarder = IController(_controller()).feeRewardForwarder();
      IERC20(_USDC_ADDRESS).safeApprove(forwarder, 0);
      IERC20(_USDC_ADDRESS).safeApprove(forwarder, toBuybacks);
      // it will sell USDC tokens to Target Token and distribute it to SmartVault and PS
      uint targetTokenEarned = IFeeRewardForwarder(forwarder).distribute(usdcAmount, _USDC_ADDRESS, _vault());
      if (targetTokenEarned > 0) {
        IBookkeeper(IController(_controller()).bookkeeper()).registerStrategyEarned(targetTokenEarned);
      }
    }

    if (toVault != 0) {
      _distributeMeshRewards(toVault);
      toVault = IERC20(_TETU_MESH).balanceOf(address(this));
      // add tetuMesh to vault rewards
      IERC20(_TETU_MESH).safeApprove(targetRewardVault, 0);
      IERC20(_TETU_MESH).safeApprove(targetRewardVault, toVault);
      ISmartVault(targetRewardVault).notifyTargetRewardAmount(_TETU_MESH, toVault);
    }
  }

  function _distributeMeshRewards(uint256 amount) internal {
    (uint256 tetuMeshReserve, uint256 meshReserve) = _getMeshReserves();
    if (tetuMeshReserve > meshReserve) {
      uint256 toSwapMaxAmount = _computeSellAmount(meshReserve, tetuMeshReserve, _MESH_PRECISION);
      address[] memory route = new address[](2);
      route[0] = _underlying();
      route[1] = _TETU_MESH;
      uint256 toSwap = Math.min(amount, toSwapMaxAmount);
      _meshSwap(toSwap, route);
    }
    uint256 tokensLeft = IERC20(_underlying()).balanceOf(address(this)) - _dust;

    if (tokensLeft > 0) {
      // invest MESH tokens to tetuMESHVault
      IERC20(_underlying()).safeApprove(_TETU_MESH, 0);
      IERC20(_underlying()).safeApprove(_TETU_MESH, tokensLeft);
      ISmartVault(_TETU_MESH).depositAndInvest(tokensLeft);
    }
  }


  function _adjustPPFS(uint256 amount) internal returns (uint256 newAmount){
    uint256 vaultTotalSupply = IERC20(_vault()).totalSupply();
    uint256 _investedUnderlyingBalance = this.investedUnderlyingBalance();
    uint256 adjustment = _investedUnderlyingBalance - vaultTotalSupply;

    //send to governance
    IERC20(_underlying()).transfer(IController(_controller()).governance(), adjustment);
    newAmount = amount - adjustment;
  }

  function _computeSellAmount(
    uint256 tokenReserve,
    uint256 oppositeReserve,
    uint256 targetPrice
  ) internal pure returns (uint256) {
    if (targetPrice == 0) {
      return 0;
    }
    // ignore fees
    uint base = oppositeReserve * tokenReserve / targetPrice * _MESH_PRECISION;
    uint256 sqrtBase = _sqrt(base);
    if (sqrtBase < tokenReserve) {
      // in this case the price lower than target price, need to sell
      return 0;
    }
    return sqrtBase - tokenReserve;
  }

  /// @dev Babylonian method (https://en.wikipedia.org/wiki/Methods_of_computing_square_roots#Babylonian_method)
  function _sqrt(uint y) internal pure returns (uint z) {
    z = 0;
    if (y > 3) {
      uint x = y / 2 + 1;
      while (x < z) {
        z = x;
        x = (y / x + x) / 2;
      }
      z = y;
    } else if (y != 0) {
      z = 1;
    }
  }


  /// @dev Not supported by MESH
  function withdrawAndClaimFromPool(uint256) internal pure override {
    revert("MSS: Withdraw forbidden");
  }

  /// @dev Not supported by MESH
  function emergencyWithdrawFromPool() internal pure override {
    revert("MSS: Method not supported");
  }

  /// @dev In this version MESH rewards are not liquidated.
  function liquidateReward() internal override {}

  /// @dev No claimable tokens
  function readyToClaim() external view override returns (uint256[] memory toClaim) {
    toClaim = new uint256[](_rewardTokens.length);
  }

  /// @dev Return full amount of staked tokens
  function poolTotalAmount() external view override returns (uint256) {
    return IERC20(_underlying()).balanceOf(address(vMesh));
  }

  /// @dev Platform name for statistical purposes
  /// @return Platform enum index
  function platform() external override pure returns (Platform) {
    return Platform.MESH;
  }
}
