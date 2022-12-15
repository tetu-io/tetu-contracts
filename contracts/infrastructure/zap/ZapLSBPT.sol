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

import "../../openzeppelin/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../../base/governance/Controllable.sol";
import "../../base/interface/ISmartVault.sol";
import "../../base/interface/IController.sol";
import "../../third_party/balancer/IBasePool.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../third_party/balancer/IBPT.sol";
import "./IMultiSwap.sol";

/// @title Liquid staking BPT zap
///        Able to zap in/out assets to TETU_ETH-BAL_tetuBAL_BPT_V3 and similar vaults
/// @author Tetu team
contract ZapLSBPT is Controllable, ReentrancyGuard {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  /// @dev this struct used to prevent "Stack too deep"
  struct ZapInfo {
    address vault;
    address tokenIn;
    address asset0;
    address[] asset0Route;
    address asset1;
    address[] asset1Route;
    uint256 tokenInAmount;
    uint256 slippageTolerance;
  }

  string public constant VERSION = "1.0.0";

  uint256 internal constant ONE = 1e18; // 18 decimal places

  IMultiSwap public multiSwap;
  mapping(address => uint256) calls;

  constructor(address _controller, address _multiSwap) {
    require(_multiSwap != address(0), "ZC: zero multiSwap address");
    Controllable.initializeControllable(_controller);
    multiSwap = IMultiSwap(_multiSwap);
  }

  modifier onlyOneCallPerBlock() {
    require(calls[msg.sender] < block.number, "ZC: call in the same block forbidden");
    _;
    calls[msg.sender] = block.number;
  }

  // ******************** USERS ACTIONS *********************

  /// @dev Add liquidity to Balancer WeightedPool, deposit/swap part to Tetu SmartVault, add liquidity to Balancer StablePool and deposit to vault.
  ///      Approval for token is assumed.
  ///      TokenIn should be declared as a keyToken in the PriceCalculator.
  /// @param _vault A target vault for deposit
  /// @param _tokenIn This token will be swapped to required token for adding liquidity
  /// @param _asset0 Token address required for adding liquidity
  /// @param _asset0Route Pair addresses for buying asset0
  /// @param _asset1 Token address required for adding liquidity
  /// @param _asset1Route Pair addresses for buying asset1
  /// @param _tokenInAmount Amount of token for deposit
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapInto(
    address _vault,
    address _tokenIn,
    address _asset0,
    address[] memory _asset0Route,
    address _asset1,
    address[] memory _asset1Route,
    uint256 _tokenInAmount,
    uint256 slippageTolerance
  ) external nonReentrant onlyOneCallPerBlock {
    require(_tokenInAmount > 1, "ZC: not enough amount");

    _zapInto(
      ZapInfo(
        _vault,
        _tokenIn,
        _asset0,
        _asset0Route,
        _asset1,
        _asset1Route,
        _tokenInAmount,
        slippageTolerance
      )
    );
  }

  function _zapInto(ZapInfo memory zapInfo) internal {
    // tetuBal-BPT-80BAL-20WETH (StablePool)
    // https://polygonscan.com/address/0xb797adfb7b268faeaa90cadbfed464c76ee599cd#readContract
    IBasePool rootBpt = IBasePool(ISmartVault(zapInfo.vault).underlying());

    // 0xb797adfb7b268faeaa90cadbfed464c76ee599cd0002000000000000000005ba
    bytes32 rootPoolId = rootBpt.getPoolId();

    // https://polygonscan.com/address/0xba12222222228d8ba445958a75a0704d566bf2c8#readContract
    // IBVault rootBptVault = IBVault(rootBpt.getVault());

    // 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f, 0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33
    // 20WETH-80BAL (WeightedPool), TETU_ST_BAL (SmartVault)
    (IERC20[] memory rootBptVaultTokens, uint[] memory rootBptVaultBalances,) = IBVault(rootBpt.getVault()).getPoolTokens(rootPoolId);

    // https://polygonscan.com/address/0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f#readContract
    IBPT wBpt = IBPT(address(rootBptVaultTokens[0]));
    uint256[] memory wBptWeights = wBpt.getNormalizedWeights();
    (IERC20[] memory wBptVaultTokens,,) = IBVault(wBpt.getVault()).getPoolTokens(wBpt.getPoolId());

    require(zapInfo.asset0 == address(wBptVaultTokens[0]) || zapInfo.asset0 == address(wBptVaultTokens[1]), "ZC: asset 0 not exist in lp tokens");
    require(zapInfo.asset1 == address(wBptVaultTokens[0]) || zapInfo.asset1 == address(wBptVaultTokens[1]), "ZC: asset 1 not exist in lp tokens");

    // transfer only require amount
    IERC20(zapInfo.tokenIn).safeTransferFrom(msg.sender, address(this), zapInfo.tokenInAmount.div(2).mul(2));

    // swap _tokenInAmount to 20% weth, 80% bal
    if (zapInfo.tokenIn != zapInfo.asset0) {
      // asset0 multi-swap
      callMultiSwap(
        zapInfo.tokenIn,
          zapInfo.tokenInAmount.div(zapInfo.asset0 == address(wBptVaultTokens[0]) ? wBptWeights[0] : wBptWeights[1]).mul(ONE),
          zapInfo.asset0Route,
          zapInfo.asset0,
          zapInfo.slippageTolerance
      );
    }

    if (zapInfo.tokenIn != zapInfo.asset1) {
      // asset1 multi-swap
      callMultiSwap(
        zapInfo.tokenIn,
          zapInfo.tokenInAmount.div(zapInfo.asset1 == address(wBptVaultTokens[0]) ? wBptWeights[0] : wBptWeights[1]).mul(ONE),
          zapInfo.asset1Route,
          zapInfo.asset1,
          zapInfo.slippageTolerance
      );
    }

    // assume that final outcome amounts was checked on the multiSwap contract side

    // add liquidity to weighted pool
    IAsset[] memory _poolTokens = new IAsset[](2);
    _poolTokens[0] = IAsset(zapInfo.asset0);
    _poolTokens[1] = IAsset(zapInfo.asset1);
    uint[] memory amounts = new uint[](2);
    amounts[0] = IERC20(zapInfo.asset0).balanceOf(address(this));
    amounts[1] = IERC20(zapInfo.asset1).balanceOf(address(this));

    IERC20(zapInfo.asset0).safeApprove(wBpt.getVault(), amounts[0]);
    IERC20(zapInfo.asset1).safeApprove(wBpt.getVault(), amounts[1]);

    IBVault(wBpt.getVault()).joinPool(
      wBpt.getPoolId(),
      address(this),
      address(this),
      IBVault.JoinPoolRequest({
        assets : _poolTokens,
        maxAmountsIn : amounts,
        userData : abi.encode(1, amounts, 1),
        fromInternalBalance : false
      })
    );

    uint wBptBalance = IERC20(address(wBpt)).balanceOf(address(this));

    require(wBptBalance != 0, "ZC: zero liq");

    // swap or deposit part of part tokens to smart vault
    ISmartVault sVault = ISmartVault(address(rootBptVaultTokens[1]));

    // rough calculations without current price, pool fee, impact
    uint canBuySmartVaultTokensByGoodPrice = rootBptVaultBalances[1] > rootBptVaultBalances[0] ? (rootBptVaultBalances[1] - rootBptVaultBalances[0]) / 2 : 0;

    uint needToMintSmartVaultTokens;
    if (canBuySmartVaultTokensByGoodPrice != 0 && canBuySmartVaultTokensByGoodPrice < wBptBalance / 2) {
      needToMintSmartVaultTokens = wBptBalance / 2 - canBuySmartVaultTokensByGoodPrice;
    }
    if (canBuySmartVaultTokensByGoodPrice == 0) {
      needToMintSmartVaultTokens = wBptBalance / 2;
    }

    if (needToMintSmartVaultTokens != 0) {
      IERC20(address(wBpt)).safeApprove(address(sVault), needToMintSmartVaultTokens);
      sVault.deposit(needToMintSmartVaultTokens);
    }

    // add liquidity to root stable pool
    _poolTokens[0] = IAsset(address(wBpt));
    _poolTokens[1] = IAsset(address(sVault));
    amounts[0] = IERC20(address(wBpt)).balanceOf(address(this));
    amounts[1] = IERC20(address(sVault)).balanceOf(address(this));

    IERC20(address(wBpt)).safeApprove(rootBpt.getVault(), amounts[0]);
    IERC20(address(sVault)).safeApprove(rootBpt.getVault(), amounts[1]);

    IBVault(rootBpt.getVault()).joinPool(
      rootPoolId,
      address(this),
      address(this),
      IBVault.JoinPoolRequest({
        assets : _poolTokens,
        maxAmountsIn : amounts,
        userData : abi.encode(1, amounts, 1),
        fromInternalBalance : false
      })
    );

    depositToVault(zapInfo.vault, IERC20(address(rootBpt)).balanceOf(address(this)), address(rootBpt));
  }

  /// @notice Approval for share token is assumed.
  ///      Withdraw from given vault underlying, remove liquidity and sell tokens for given tokenOut
  /// @param _vault A target vault for withdraw
  /// @param _tokenOut This token will be a target for swaps
  /// @param _asset0 Token address required selling removed assets
  /// @param _asset0Route Pair addresses for selling asset0
  /// @param _asset1 Token address required selling removed assets
  /// @param _asset1Route Pair addresses for selling asset1
  /// @param _shareTokenAmount Amount of share token for withdraw
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapOut(
    address _vault,
    address _tokenOut,
    address _asset0,
    address[] memory _asset0Route,
    address _asset1,
    address[] memory _asset1Route,
    uint256 _shareTokenAmount,
    uint256 slippageTolerance
  ) external nonReentrant onlyOneCallPerBlock {
    require(_shareTokenAmount != 0, "ZC: zero amount");
    _zapOut(
      ZapInfo(
        _vault,
        _tokenOut,
        _asset0,
        _asset0Route,
        _asset1,
        _asset1Route,
        _shareTokenAmount,
        slippageTolerance
      )
    );
  }

  function _zapOut(ZapInfo memory zapInfo) internal {
    // tetuBal-BPT-80BAL-20WETH (StablePool)
    // https://polygonscan.com/address/0xb797adfb7b268faeaa90cadbfed464c76ee599cd#readContract
    IBasePool rootBpt = IBasePool(ISmartVault(zapInfo.vault).underlying());

    // 0xb797adfb7b268faeaa90cadbfed464c76ee599cd0002000000000000000005ba
    bytes32 rootPoolId = rootBpt.getPoolId();

    // https://polygonscan.com/address/0xba12222222228d8ba445958a75a0704d566bf2c8#readContract
    IBVault rootBptVault = IBVault(rootBpt.getVault());

    // 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f, 0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33
    // 20WETH-80BAL (WeightedPool), TETU_ST_BAL (SmartVault)
    (IERC20[] memory rootBptVaultTokens,,) = rootBptVault.getPoolTokens(rootPoolId);

    // https://polygonscan.com/address/0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f#readContract
    IBPT wBpt = IBPT(address(rootBptVaultTokens[0]));
    IBVault wBptVault = IBVault(wBpt.getVault());
    (IERC20[] memory wBptVaultTokens,,) = wBptVault.getPoolTokens(rootPoolId);

    require(zapInfo.asset0 == address(wBptVaultTokens[0]) || zapInfo.asset0 == address(wBptVaultTokens[1]), "ZC: asset 0 not exist in lp tokens");
    require(zapInfo.asset1 == address(wBptVaultTokens[0]) || zapInfo.asset1 == address(wBptVaultTokens[1]), "ZC: asset 1 not exist in lp tokens");

    IERC20(zapInfo.vault).safeTransferFrom(msg.sender, address(this), zapInfo.tokenInAmount);

    /*uint256 lpBalance = */withdrawFromVault(zapInfo.vault, address(rootBpt), zapInfo.tokenInAmount);

    // remove liquidity from stable pool
    uint256[] memory rootPoolBalance = rootBptVault.getInternalBalance(address(this), rootBptVaultTokens);
    IAsset[] memory _poolTokens = new IAsset[](2);
    _poolTokens[0] = IAsset(address(rootBptVaultTokens[0]));
    _poolTokens[1] = IAsset(address(rootBptVaultTokens[1]));

    IERC20(rootBptVaultTokens[0]).safeApprove(address(wBptVault), rootPoolBalance[0]);
    IERC20(rootBptVaultTokens[1]).safeApprove(address(wBptVault), rootPoolBalance[1]);

    rootBptVault.exitPool(
      rootPoolId,
      address(this),
      payable(address(this)), IBVault.ExitPoolRequest({
        assets : _poolTokens,
        minAmountsOut : rootPoolBalance,
        userData : abi.encode(1, rootPoolBalance, 1),
        toInternalBalance : false
      })
    );

    // swap rootPoolBalance[1] to rootPoolBalance[0]
    IERC20(rootBptVaultTokens[1]).safeApprove( address(rootBptVault), rootPoolBalance[1]);
    rootBptVault.swap(
      IBVault.SingleSwap({
        poolId : rootPoolId,
        kind : IBVault.SwapKind.GIVEN_IN,
        assetIn : IAsset(address(rootBptVaultTokens[0])),
        assetOut : IAsset(address(rootBptVaultTokens[1])),
        amount : rootPoolBalance[1],
        userData : ""
      }),
      IBVault.FundManagement({
        sender : address(this),
        fromInternalBalance : false,
        recipient : payable(address(this)),
        toInternalBalance : false
      }),
      1,
      block.timestamp
    );

    // remove liquidity from weighted pool
    IERC20(rootBptVaultTokens[0]).safeApprove(address(wBptVault), IERC20(rootBptVaultTokens[0]).balanceOf(address(this)));

    uint256[] memory wBptPoolBalance = wBptVault.getInternalBalance(address(this), wBptVaultTokens);
    _poolTokens[0] = IAsset(address(wBptVaultTokens[0]));
    _poolTokens[1] = IAsset(address(wBptVaultTokens[1]));

    IERC20(wBptVaultTokens[0]).safeApprove(address(wBptVault), wBptPoolBalance[0]);
    IERC20(wBptVaultTokens[1]).safeApprove(address(wBptVault), wBptPoolBalance[1]);

    wBptVault.exitPool(
      wBpt.getPoolId(),
      address(this),
      payable(address(this)),
      IBVault.ExitPoolRequest({
        assets : _poolTokens,
        minAmountsOut : wBptPoolBalance,
        userData : abi.encode(1, wBptPoolBalance, 1),
        toInternalBalance : false
      })
    );

    // asset0 multi-swap
    callMultiSwap(
        zapInfo.asset0,
        IERC20(zapInfo.asset0).balanceOf(address(this)),
        zapInfo.asset0Route,
        zapInfo.tokenIn,
        zapInfo.slippageTolerance
    );

    // asset1 multi-swap
    callMultiSwap(
        zapInfo.asset1,
        IERC20(zapInfo.asset1).balanceOf(address(this)),
        zapInfo.asset1Route,
        zapInfo.tokenIn,
        zapInfo.slippageTolerance
    );

    uint256 tokenOutBalance = IERC20(zapInfo.tokenIn).balanceOf(address(this));
    require(tokenOutBalance != 0, "zero token out balance");
    IERC20(zapInfo.tokenIn).safeTransfer(msg.sender, tokenOutBalance);
  }

  // ************************* INTERNAL *******************

  function callMultiSwap(
    address _tokenIn,
    uint256 _tokenInAmount,
    address[] memory _lpRoute,
    address _tokenOut,
    uint256 slippageTolerance
  ) internal {
    if (_tokenIn == _tokenOut) {
      // no actions if we already have required token
      return;
    }
    require(_tokenInAmount <= IERC20(_tokenIn).balanceOf(address(this)), "ZC: not enough balance for multi-swap");
    IERC20(_tokenIn).safeApprove(address(multiSwap), 0);
    IERC20(_tokenIn).safeApprove(address(multiSwap), _tokenInAmount);
    multiSwap.multiSwap(_lpRoute, _tokenIn, _tokenOut, _tokenInAmount, slippageTolerance);
  }

  /// @dev Deposit into the vault, check the result and send share token to msg.sender
  function depositToVault(address _vault, uint256 _amount, address _underlying) internal {
    require(ISmartVault(_vault).underlying() == _underlying, "ZC: wrong lp for vault");

    IERC20(_underlying).safeApprove(_vault, 0);
    IERC20(_underlying).safeApprove(_vault, _amount);
    ISmartVault(_vault).depositAndInvest(_amount);

    uint256 shareBalance = IERC20(_vault).balanceOf(address(this));
    require(shareBalance != 0, "ZC: zero shareBalance");

    IERC20(_vault).safeTransfer(msg.sender, shareBalance);
  }

  /// @dev Withdraw from vault and check the result
  function withdrawFromVault(address _vault, address _underlying, uint256 _amount) internal returns (uint256){
    ISmartVault(_vault).withdraw(_amount);

    uint256 underlyingBalance = IERC20(_underlying).balanceOf(address(this));
    require(underlyingBalance != 0, "ZC: zero underlying balance");
    return underlyingBalance;
  }

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint256 _amount) external onlyControllerOrGovernance {
    IERC20(_token).safeTransfer(msg.sender, _amount);
  }

}
