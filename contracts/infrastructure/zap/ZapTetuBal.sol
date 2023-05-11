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
import "../../openzeppelin/ReentrancyGuard.sol";
import "../../base/governance/Controllable.sol";
import "../../base/interfaces/ISmartVault.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../third_party/balancer/IBalancerHelper.sol";

/// @title Zap for tetuBAL
/// @author a17
contract ZapTetuBal is Controllable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  string public constant VERSION = "1.1.0";
  uint internal constant ONE = 1e18; // 18 decimal places
  address public constant TETU_VAULT = 0xBD06685a0e7eBd7c92fc84274b297791F3997ed3; // TETU_ETH-BAL_tetuBAL_BPT_V3
  address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
  address public constant BALANCER_VAULT_TOKEN0 = 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f; // 20WETH-80BAL
  address public constant BALANCER_VAULT_TOKEN1 = 0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33; // TETU_ST_BAL
  bytes32 public constant BALANCER_POOL_ID = 0xb797adfb7b268faeaa90cadbfed464c76ee599cd0002000000000000000005ba;
  uint public constant BALANCER_W_WEIGHT0 = 200000000000000000;
  uint public constant BALANCER_W_WEIGHT1 = 800000000000000000;
  bytes32 public constant BALANCER_W_POOL_ID = 0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f000200000000000000000426;
  address public constant BALANCER_HELPER = 0x239e55F427D44C3cc793f49bFB507ebe76638a2b;
  address public constant ASSET0 = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619; // WETH
  address public constant ASSET1 = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3; // BAL
  address public constant ONEINCH_ROUTER = 0x1111111254fb6c44bAC0beD2854e76F90643097d;

  mapping(address => uint) calls;

  constructor(address _controller) {
    Controllable.initializeControllable(_controller);
    IERC20(ISmartVault(TETU_VAULT).underlying()).safeApprove(TETU_VAULT, type(uint).max);
    IERC20(BALANCER_VAULT_TOKEN0).safeApprove(BALANCER_VAULT_TOKEN1, type(uint).max);
  }

  modifier onlyOneCallPerBlock() {
    require(calls[msg.sender] < block.number, "ZC: call in the same block forbidden");
    _;
    calls[msg.sender] = block.number;
  }

  // ******************** USERS ACTIONS *********************

  /// @dev Add liquidity to Balancer WeightedPool, deposit/swap part to Tetu SmartVault, add liquidity to Balancer StablePool and deposit to vault.
  ///      Approval for token is assumed.
  /// @param _tokenIn This token will be swapped to required token for adding liquidity
  /// @param _asset0SwapData Calldata for swap _tokenIn to _asset0 by 1inch
  /// @param _asset1SwapData Calldata for swap _tokenIn to _asset1 by 1inch
  /// @param _tokenInAmount Amount of token for deposit
  function zapInto(
    address _tokenIn,
    bytes memory _asset0SwapData,
    bytes memory _asset1SwapData,
    uint _tokenInAmount
  ) external nonReentrant onlyOneCallPerBlock {
    require(_tokenInAmount > 1, "ZC: not enough amount");
    (, uint[] memory rootBptVaultBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(BALANCER_POOL_ID);

    // transfer only require amount
    IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _tokenInAmount);

    if (_tokenIn != ASSET0) {
      // asset0 swap by 1inch
      callOneInchSwap(
        _tokenIn,
        _tokenInAmount * BALANCER_W_WEIGHT0 / ONE,
        _asset0SwapData
      );
    }

    if (_tokenIn != ASSET1) {
      // asset1 swap by 1inch
      callOneInchSwap(
        _tokenIn,
        _tokenInAmount * BALANCER_W_WEIGHT1 / ONE,
        _asset1SwapData
      );
    }

    // add liquidity to weighted pool
    joinBalancerPool(BALANCER_VAULT, BALANCER_W_POOL_ID, ASSET0, ASSET1, IERC20(ASSET0).balanceOf(address(this)), IERC20(ASSET1).balanceOf(address(this)));

    uint wBptBalance = IERC20(BALANCER_VAULT_TOKEN0).balanceOf(address(this));

    require(wBptBalance != 0, "ZC: zero liq");

    // swap or deposit part of part tokens to smart vault
    ISmartVault sVault = ISmartVault(BALANCER_VAULT_TOKEN1);

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
      sVault.depositAndInvest(needToMintSmartVaultTokens);
    }

    // add liquidity to root stable pool
    joinBalancerPool(BALANCER_VAULT, BALANCER_POOL_ID, BALANCER_VAULT_TOKEN0, address(sVault), IERC20(BALANCER_VAULT_TOKEN0).balanceOf(address(this)), IERC20(address(sVault)).balanceOf(address(this)));

    depositToVault(IERC20(ISmartVault(TETU_VAULT).underlying()).balanceOf(address(this)));

    uint dustBalance = IERC20(_tokenIn).balanceOf(address(this));
    if (dustBalance != 0) {
      IERC20(_tokenIn).safeTransfer(msg.sender, dustBalance);
    }
  }

  /// @notice Approval for share token is assumed.
  ///      Withdraw from given vault underlying, remove liquidity and sell tokens for given tokenOut
  /// @param _tokenOut This token will be a target for swaps
  /// @param _asset0SwapData Calldata for swap _asset0 to _tokenOut by 1inch
  /// @param _asset1SwapData Calldata for swap _asset1 to _tokenOut by 1inch
  /// @param _shareTokenAmount Amount of share token for withdraw
  function zapOut(
    address _tokenOut,
    bytes memory _asset0SwapData,
    bytes memory _asset1SwapData,
    uint _shareTokenAmount
  ) external nonReentrant onlyOneCallPerBlock {
    require(_shareTokenAmount != 0, "ZC: zero amount");
    IERC20(TETU_VAULT).safeTransferFrom(msg.sender, address(this), _shareTokenAmount);

    uint withdrawnAmount = withdrawFromVault(_shareTokenAmount);

    // remove liquidity from stable pool
    uint[] memory exitAmounts = exitBalancerPool(BALANCER_VAULT, BALANCER_POOL_ID, BALANCER_VAULT_TOKEN0, BALANCER_VAULT_TOKEN1, withdrawnAmount, true);

    // remove liquidity from weighted pool
    exitAmounts = exitBalancerPool(BALANCER_VAULT, BALANCER_W_POOL_ID, ASSET0, ASSET1, exitAmounts[0], false);

    // asset0 swap by 1inch
    if (_tokenOut != ASSET0) {
      callOneInchSwap(
        ASSET0,
        exitAmounts[0],
        _asset0SwapData
      );
    }

    // asset1 swap by 1inch
    if (_tokenOut != ASSET1) {
      callOneInchSwap(
        ASSET1,
        exitAmounts[1],
        _asset1SwapData
      );
    }

    uint tokenOutBalance = IERC20(_tokenOut).balanceOf(address(this));
    require(tokenOutBalance != 0, "zero token out balance");
    IERC20(_tokenOut).safeTransfer(msg.sender, tokenOutBalance);
  }

  function quoteInSharedAmount(uint _asset0Amount, uint _asset1Amount) external returns(uint) {
    IBalancerHelper helper = IBalancerHelper(BALANCER_HELPER);
    address[] memory _poolTokens = new address[](2);
    _poolTokens[0] = ASSET0;
    _poolTokens[1] = ASSET1;
    uint[] memory amounts = new uint[](2);
    amounts[0] = _asset0Amount;
    amounts[1] = _asset1Amount;
    (uint wBptBalance,) = helper.queryJoin(
      BALANCER_W_POOL_ID,
      address(this),
      payable(address(this)),
      IVault.JoinPoolRequest({
        assets : _poolTokens,
        maxAmountsIn : amounts,
        userData : abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amounts, 0),
        fromInternalBalance : false
      })
    );
    // swap or deposit part of part tokens to smart vault
    (, uint[] memory rootBptVaultBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(BALANCER_POOL_ID);
    // rough calculations without current price, pool fee, impact
    uint canBuySmartVaultTokensByGoodPrice = rootBptVaultBalances[1] > rootBptVaultBalances[0] ? (rootBptVaultBalances[1] - rootBptVaultBalances[0]) / 2 : 0;
    uint needToMintSmartVaultTokens;
    if (canBuySmartVaultTokensByGoodPrice != 0 && canBuySmartVaultTokensByGoodPrice < wBptBalance / 2) {
      needToMintSmartVaultTokens = wBptBalance / 2 - canBuySmartVaultTokensByGoodPrice;
    }
    if (canBuySmartVaultTokensByGoodPrice == 0) {
      needToMintSmartVaultTokens = wBptBalance / 2;
    }
    _poolTokens[0] = BALANCER_VAULT_TOKEN0;
    _poolTokens[1] = BALANCER_VAULT_TOKEN1;
    amounts[0] = wBptBalance - needToMintSmartVaultTokens;
    amounts[1] = needToMintSmartVaultTokens;
    (uint rootBptOut,) = helper.queryJoin(
      BALANCER_POOL_ID,
      address(this),
      payable(address(this)),
      IVault.JoinPoolRequest({
        assets : _poolTokens,
        maxAmountsIn : amounts,
        userData : abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amounts, 0),
        fromInternalBalance : false
      })
    );
    return rootBptOut * IERC20(TETU_VAULT).totalSupply() / ISmartVault(TETU_VAULT).underlyingBalanceWithInvestment();
  }

  function quoteOutAssets( uint _shareAmount) external returns(uint[] memory) {
    IBalancerHelper helper = IBalancerHelper(BALANCER_HELPER);
    uint rootBptAmountOut = _shareAmount * ISmartVault(TETU_VAULT).underlyingBalanceWithInvestment() / IERC20(TETU_VAULT).totalSupply();
    address[] memory _poolTokens = new address[](2);
    _poolTokens[0] = BALANCER_VAULT_TOKEN0;
    _poolTokens[1] = BALANCER_VAULT_TOKEN1;
    uint[] memory amounts = new uint[](2);
    amounts[0] = 0;
    amounts[1] = 0;
    (, uint[] memory rootAmountsOut) = helper.queryExit(
      BALANCER_POOL_ID,
      address(this),
      payable(address(this)),
      IVault.JoinPoolRequest({
        assets : _poolTokens,
        maxAmountsIn : amounts,
        userData : abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, rootBptAmountOut, 0),
        fromInternalBalance : false
      })
    );
    _poolTokens[0] = ASSET0;
    _poolTokens[1] = ASSET1;
    (, uint[] memory amountsOut) = helper.queryExit(
      BALANCER_W_POOL_ID,
      address(this),
      payable(address(this)),
      IVault.JoinPoolRequest({
        assets : _poolTokens,
        maxAmountsIn : amounts,
        userData : abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_TOKENS_OUT, rootAmountsOut[0]),
        fromInternalBalance : false
      })
    );
    return amountsOut;
  }

  // ************************* INTERNAL *******************

  function joinBalancerPool(address _bVault, bytes32 _poolId, address _token0, address _token1, uint _amount0, uint _amount1) internal {
    require(_amount0 != 0 || _amount1 != 0, "ZC: zero amounts");

    _approveIfNeeds(_token0, _amount0, _bVault);
    _approveIfNeeds(_token1, _amount1, _bVault);

    IAsset[] memory _poolTokens = new IAsset[](2);
    _poolTokens[0] = IAsset(_token0);
    _poolTokens[1] = IAsset(_token1);

    uint[] memory amounts = new uint[](2);
    amounts[0] = _amount0;
    amounts[1] = _amount1;

    IBVault(_bVault).joinPool(
      _poolId,
      address(this),
      address(this),
      IBVault.JoinPoolRequest({
        assets : _poolTokens,
        maxAmountsIn : amounts,
        userData : abi.encode(1, amounts, 1),
        fromInternalBalance : false
      })
    );
  }

  function exitBalancerPool(address _bVault, bytes32 _poolId, address _vaultToken0, address _vaultToken1, uint _amount, bool oneTokenOut) internal returns(uint[] memory) {
    require(_amount != 0, "ZC: zero amount");

    uint[] memory amounts = new uint[](2);

    IAsset[] memory _poolTokens = new IAsset[](2);
    _poolTokens[0] = IAsset(_vaultToken0);
    _poolTokens[1] = IAsset(_vaultToken1);

    IBVault(_bVault).exitPool(
      _poolId,
      address(this),
      payable(address(this)),
      IBVault.ExitPoolRequest({
        assets : _poolTokens,
        minAmountsOut : amounts,
        userData : oneTokenOut ? abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, _amount, 0) : abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_TOKENS_OUT, _amount),
        toInternalBalance : false
      })
    );

    amounts[0] = IERC20(_vaultToken0).balanceOf(address(this));
    amounts[1] = IERC20(_vaultToken1).balanceOf(address(this));

    return amounts;
  }

  function callOneInchSwap(
    address _tokenIn,
    uint _tokenInAmount,
    bytes memory _swapData
  ) internal {
    require(_tokenInAmount <= IERC20(_tokenIn).balanceOf(address(this)), "ZC: not enough balance for swap");
    _approveIfNeeds(_tokenIn, _tokenInAmount, ONEINCH_ROUTER);
    (bool success,bytes memory result) = ONEINCH_ROUTER.call(_swapData);
    require(success, string(result));
  }

  /// @dev Deposit into the vault, check the result and send share token to msg.sender
  function depositToVault(uint _amount) internal {
    ISmartVault(TETU_VAULT).depositAndInvest(_amount);
    uint shareBalance = IERC20(TETU_VAULT).balanceOf(address(this));
    require(shareBalance != 0, "ZC: zero shareBalance");
    IERC20(TETU_VAULT).safeTransfer(msg.sender, shareBalance);
  }

  /// @dev Withdraw from vault and check the result
  function withdrawFromVault(uint _amount) internal returns (uint) {
    address _underlying = ISmartVault(TETU_VAULT).underlying();
    ISmartVault(TETU_VAULT).withdraw(_amount);
    uint underlyingBalance = IERC20(_underlying).balanceOf(address(this));
    require(underlyingBalance != 0, "ZC: zero underlying balance");
    return underlyingBalance;
  }

  function _approveIfNeeds(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).safeApprove(spender, 0);
      IERC20(token).safeApprove(spender, type(uint).max);
    }
  }

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint _amount) external onlyControllerOrGovernance {
    IERC20(_token).safeTransfer(msg.sender, _amount);
  }
}
