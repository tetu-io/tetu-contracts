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
import "../../openzeppelin/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../../base/governance/Controllable.sol";
import "../../base/interface/ISmartVault.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../third_party/balancer/IBPT.sol";
import "../../third_party/balancer/IBalancerHelper.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";


contract ZapV2 is Controllable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";
    address public constant ONEINCH_ROUTER = 0x1111111254fb6c44bAC0beD2854e76F90643097d;
    address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address public constant BALANCER_HELPER = 0x239e55F427D44C3cc793f49bFB507ebe76638a2b;

    mapping(address => uint) calls;

    constructor(address controller_) {
        Controllable.initializeControllable(controller_);
    }

    modifier onlyOneCallPerBlock() {
        require(calls[msg.sender] < block.number, "ZC: call in the same block forbidden");
        _;
        calls[msg.sender] = block.number;
    }

    // ******************** USERS ZAP ACTIONS *********************

    function zapIntoSingle(
        address vault,
        address tokenIn,
        bytes memory assetSwapData,
        uint tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(tokenInAmount > 1, "ZC: not enough amount");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

        address asset = ISmartVault(vault).underlying();

        if (tokenIn != asset) {
            _callOneInchSwap(
                tokenIn,
                tokenInAmount,
                assetSwapData
            );
        }

        uint assetAmount = IERC20(asset).balanceOf(address(this));

        _depositToVault(vault, asset, assetAmount);
    }

    function zapOutSingle(
        address vault,
        address tokenOut,
        bytes memory assetSwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(shareAmount != 0, "ZC: zero amount");

        IERC20(vault).safeTransferFrom(msg.sender, address(this), shareAmount);

        address asset = ISmartVault(vault).underlying();

        uint assetBalance = _withdrawFromVault(vault, asset, shareAmount);

        if (tokenOut != asset) {
            _callOneInchSwap(
                asset,
                assetBalance,
                assetSwapData
            );
        }

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);
    }

    function zapIntoUniswapV2(
        address vault,
        address tokenIn,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(tokenInAmount > 1, "ZC: not enough amount");

        IUniswapV2Pair lp = IUniswapV2Pair(ISmartVault(vault).underlying());

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount / 2 * 2);

        address asset0 = lp.token0();
        address asset1 = lp.token1();

        if (tokenIn != asset0) {
            _callOneInchSwap(
                tokenIn,
                tokenInAmount / 2,
                asset0SwapData
            );
        }

        if (tokenIn != asset1) {
            _callOneInchSwap(
                tokenIn,
                tokenInAmount / 2,
                asset1SwapData
            );
        }

        uint lpAmount = _addLiquidityUniswapV2(address(lp), asset0, asset1);

        _depositToVault(vault, address(lp), lpAmount);

        _sendBackChange(asset0, asset1);
    }

    function zapOutUniswapV2(
        address vault,
        address tokenOut,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(shareAmount != 0, "ZC: zero amount");

        IERC20(vault).safeTransferFrom(msg.sender, address(this), shareAmount);

        address lp = ISmartVault(vault).underlying();

        uint lpBalance = _withdrawFromVault(vault, lp, shareAmount);

        IERC20(lp).safeTransfer(lp, lpBalance);

        (uint amount0, uint amount1) = IUniswapV2Pair(lp).burn(address(this));
        address asset0 = IUniswapV2Pair(lp).token0();
        address asset1 = IUniswapV2Pair(lp).token1();

        if (tokenOut != asset0) {
            _callOneInchSwap(
                asset0,
                amount0,
                asset0SwapData
            );
        }

        if (tokenOut != asset1) {
            _callOneInchSwap(
                asset1,
                amount1,
                asset1SwapData
            );
        }

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);

        _sendBackChange(asset0, asset1);
    }

    function zapIntoBalancer(
        address vault,
        address tokenIn,
        address[] memory assets,
        bytes[] memory assetsSwapData,
        uint[] memory tokenInAmounts
    ) external nonReentrant onlyOneCallPerBlock {
        uint len = assets.length;

        uint totalTokenInAmount;
        uint i;
        for (; i < len; i++) {
            totalTokenInAmount += tokenInAmounts[i];
        }

        require(totalTokenInAmount > 1, "ZC: not enough amount");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), totalTokenInAmount);

        address bpt = ISmartVault(vault).underlying();
        bytes32 poolId = IBPT(bpt).getPoolId();

        uint[] memory amounts = new uint[](len);
        for (i = 0; i < len; i++) {
            if (tokenInAmounts[i] != 0 && tokenIn != assets[i]) {
                _callOneInchSwap(
                    tokenIn,
                    tokenInAmounts[i],
                    assetsSwapData[i]
                );
                amounts[i] = IERC20(assets[i]).balanceOf(address(this));
            }
        }

        _addLiquidityBalancer(poolId, assets, amounts);

        uint bptBalance = IERC20(bpt).balanceOf(address(this));

        require(bptBalance != 0, "ZC: zero liq");

        _depositToVault(vault, bpt, bptBalance);
    }

    function zapOutBalancer(
        address vault,
        address tokenOut,
        address[] memory assets,
        uint[] memory amounts,
        bytes[] memory assetsSwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(vault).safeTransferFrom(msg.sender, address(this), shareAmount);
        address bpt = ISmartVault(vault).underlying();
        bytes32 poolId = IBPT(bpt).getPoolId();

        uint bptOut = _withdrawFromVault(vault, bpt, shareAmount);

        uint len = assets.length;

        uint[] memory amountsOut = _removeLiquidityBalancer(poolId, assets, amounts, bptOut);

        for (uint i; i < len; i++) {
            if (assets[i] != bpt && amountsOut[i] != 0 && tokenOut != assets[i]) {
                _callOneInchSwap(
                    assets[i],
                    amountsOut[i],
                    assetsSwapData[i]
                );
            }
        }

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);

        _sendBackChangeAll(assets);
    }

    // ******************** QUOTE HELPERS *********************

    function quoteIntoSingle(address vault, uint amount) external view returns(uint) {
        return amount * IERC20(vault).totalSupply() / ISmartVault(vault).underlyingBalanceWithInvestment();
    }

    function quoteOutSingle(address vault, uint shareAmount) external view returns(uint) {
        return shareAmount * ISmartVault(vault).underlyingBalanceWithInvestment() / IERC20(vault).totalSupply();
    }

    function quoteIntoUniswapV2(address vault, uint amount0, uint amount1) external view returns(uint) {
        address lp = ISmartVault(vault).underlying();
        uint totalSupply = IERC20(lp).totalSupply();
        uint amountA;
        uint amountB;
        uint liquidity;
        (uint reserve0, uint reserve1,) = IUniswapV2Pair(lp).getReserves();
        uint amount1Optimal = _quoteLiquidityUniswapV2(amount0, reserve0, reserve1);
        if (amount1Optimal <= amount1) {
            (amountA, amountB) = (amount0, amount1Optimal);
            liquidity = Math.min(amountA * totalSupply / reserve0, amountB * totalSupply / reserve1);
        } else {
            uint amount0Optimal = _quoteLiquidityUniswapV2(amount1, reserve1, reserve0);
            (amountA, amountB) = (amount0Optimal, amount1);
            liquidity = Math.min(amountA * totalSupply / reserve0, amountB * totalSupply / reserve1);
        }
        return liquidity * IERC20(vault).totalSupply() / ISmartVault(vault).underlyingBalanceWithInvestment();
    }

    function quoteOutUniswapV2(address vault, uint shareAmount) external view returns(uint[] memory) {
        uint liquidityOut = shareAmount * ISmartVault(vault).underlyingBalanceWithInvestment() / IERC20(vault).totalSupply();
        address lp = ISmartVault(vault).underlying();
        uint totalSupply = IERC20(lp).totalSupply();
        (uint reserve0, uint reserve1,) = IUniswapV2Pair(lp).getReserves();
        uint[] memory amountsOut = new uint[](2);
        // -1 need for working zapOutUniswapV2 with tetuswap
        amountsOut[0] = liquidityOut * reserve0 / totalSupply - 1;
        amountsOut[1] = liquidityOut * reserve1 / totalSupply - 1;
        return amountsOut;
    }

    function quoteIntoBalancer(address vault, address[] memory assets, uint[] memory amounts) external returns(uint) {
        address bpt = ISmartVault(vault).underlying();
        bytes32 poolId = IBPT(bpt).getPoolId();
        uint bptOut = _quoteJoinBalancer(poolId, assets, amounts);
        return bptOut * IERC20(vault).totalSupply() / ISmartVault(vault).underlyingBalanceWithInvestment();
    }

    /// @dev Quote out for ComposableStablePool with BPT inside.
    ///      This unusual algorithm is used due to the impossibility of using EXACT_BPT_IN_FOR_ALL_TOKENS_OUT for target pools.
    function quoteOutBalancer(address vault, address[] memory assets, uint shareAmount) external view returns(uint[] memory) {
        address bpt = ISmartVault(vault).underlying();
        bytes32 poolId = IBPT(bpt).getPoolId();
        uint bptAmountOut = shareAmount * ISmartVault(vault).underlyingBalanceWithInvestment() / IERC20(vault).totalSupply();
        uint len = assets.length;
        uint bptNotInPool;
        uint i;
        (, uint[] memory tokensBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(poolId);
        for (; i < len; i++) {
            if (assets[i] == bpt) {
                bptNotInPool = IERC20(bpt).totalSupply() - tokensBalances[i];
            }
        }

        uint[] memory amounts = new uint[](len);
        for (i = 0; i < len; i++) {
            if (assets[i] != bpt) {
                amounts[i] = tokensBalances[i] * bptAmountOut / bptNotInPool * 999998 / 1000000;
            }
        }

        return amounts;
    }

    // ************************* INTERNAL *******************

    /// @dev Was made to prevent the 'Stack too deep'
    function _quoteJoinBalancer(bytes32 poolId, address[] memory assets, uint[] memory amounts) internal returns(uint) {
        uint len = assets.length;
        uint userDataAmountsLen;
        uint i;
        for (; i < len; i++) {
            if (amounts[i] != 0) {
                userDataAmountsLen++;
            }
        }

        uint[] memory userDataAmounts = new uint[](userDataAmountsLen);
        uint k;
        for (i = 0; i < len; i++) {
            if (amounts[i] != 0) {
                userDataAmounts[k] = amounts[i];
                k++;
            }
        }

        (uint bptOut,) = IBalancerHelper(BALANCER_HELPER).queryJoin(
            poolId,
            address(this),
            address(this),
            IVault.JoinPoolRequest({
                assets : assets,
                maxAmountsIn : amounts,
                userData : abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, 0),
                fromInternalBalance : false
            })
        );

        return bptOut;
    }

    function _addLiquidityBalancer(bytes32 poolId, address[] memory assets, uint[] memory amounts) internal {
        uint len = assets.length;
        IAsset[] memory _poolTokens = new IAsset[](len);
        uint userDataAmountsLen;
        uint i;
        for (; i < len; i++) {
            if (amounts[i] != 0) {
                _approveIfNeeds(assets[i], amounts[i], BALANCER_VAULT);
                userDataAmountsLen++;
            }
            _poolTokens[i] = IAsset(assets[i]);
        }

        uint[] memory userDataAmounts = new uint[](userDataAmountsLen);
        uint k;
        for (i = 0; i < len; i++) {
            if (amounts[i] != 0) {
                userDataAmounts[k] = amounts[i];
                k++;
            }
        }

        IBVault(BALANCER_VAULT).joinPool(
            poolId,
            address(this),
            address(this),
            IBVault.JoinPoolRequest({
                assets : _poolTokens,
                maxAmountsIn : amounts,
                userData : abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, userDataAmounts, 0),
                fromInternalBalance : false
            })
        );
    }

    function _removeLiquidityBalancer(bytes32 poolId, address[] memory assets, uint[] memory amounts, uint bptAmount) internal returns(uint[] memory) {
        require(bptAmount != 0, "ZC: zero amount");
        uint len = assets.length;

        uint[] memory _amounts = new uint[](len);

        IAsset[] memory _poolTokens = new IAsset[](len);
        uint i;
        for (; i < len; i++) {
            _poolTokens[i] = IAsset(assets[i]);
        }

        IBVault(BALANCER_VAULT).exitPool(
            poolId,
            address(this),
            payable(address(this)),
            IBVault.ExitPoolRequest({
                assets : _poolTokens,
                minAmountsOut : _amounts,
                userData : abi.encode(1, amounts, bptAmount), // BPT_IN_FOR_EXACT_TOKENS_OUT
                toInternalBalance : false
            })
        );

        for (i = 0; i < len; i++) {
            _amounts[i] = IERC20(assets[i]).balanceOf(address(this));
        }

        return _amounts;
    }

    function _addLiquidityUniswapV2(address lp, address asset0, address asset1) internal returns (uint) {
        uint amount0 = IERC20(asset0).balanceOf(address(this));
        uint amount1 = IERC20(asset1).balanceOf(address(this));
        uint amountA;
        uint amountB;

        (uint reserve0, uint reserve1,) = IUniswapV2Pair(lp).getReserves();
        uint amount1Optimal = _quoteLiquidityUniswapV2(amount0, reserve0, reserve1);
        if (amount1Optimal <= amount1) {
            (amountA, amountB) = (amount0, amount1Optimal);
        } else {
            uint amount0Optimal = _quoteLiquidityUniswapV2(amount1, reserve1, reserve0);
            (amountA, amountB) = (amount0Optimal, amount1);
        }

        IERC20(asset0).safeTransfer(lp, amountA);
        IERC20(asset1).safeTransfer(lp, amountB);
        return IUniswapV2Pair(lp).mint(address(this));
    }

    /// @dev Given some amount of an asset and pair reserves, returns an equivalent amount of the other asset.
    function _quoteLiquidityUniswapV2(uint amountA, uint reserveA, uint reserveB) internal pure returns (uint amountB) {
        require(amountA > 0, 'ZC: INSUFFICIENT_AMOUNT');
        require(reserveA > 0 && reserveB > 0, 'ZC: INSUFFICIENT_LIQUIDITY');
        amountB = amountA * reserveB / reserveA;
    }

    function _sendBackChangeAll(address[] memory assets) internal {
        uint len = assets.length;
        for (uint i; i < len; i++) {
            uint bal = IERC20(assets[i]).balanceOf(address(this));
            if (bal != 0) {
                IERC20(assets[i]).safeTransfer(msg.sender, bal);
            }
        }
    }

    function _sendBackChange(address asset0, address asset1) internal {
        uint bal0 = IERC20(asset0).balanceOf(address(this));
        uint bal1 = IERC20(asset1).balanceOf(address(this));

        if (bal0 != 0) {
            IERC20(asset0).safeTransfer(msg.sender, bal0);
        }

        if (bal1 != 0) {
            IERC20(asset1).safeTransfer(msg.sender, bal1);
        }
    }

    function _callOneInchSwap(address tokenIn, uint tokenInAmount, bytes memory swapData) internal {
        require(tokenInAmount <= IERC20(tokenIn).balanceOf(address(this)), "ZC: not enough balance for swap");
        _approveIfNeeds(tokenIn, tokenInAmount, ONEINCH_ROUTER);
        (bool success,bytes memory result) = ONEINCH_ROUTER.call(swapData);
        require(success, string(result));
    }

    /// @dev Deposit into the vault, check the result and send share token to msg.sender
    function _depositToVault(address vault, address asset, uint amount) internal {
        _approveIfNeeds(asset, amount, vault);
        ISmartVault(vault).depositAndInvest(amount);
        uint shareBalance = IERC20(vault).balanceOf(address(this));
        require(shareBalance != 0, "ZC: zero shareBalance");
        IERC20(vault).safeTransfer(msg.sender, shareBalance);
    }

    /// @dev Withdraw from vault and check the result
    function _withdrawFromVault(address vault, address asset, uint amount) internal returns (uint) {
        ISmartVault(vault).withdraw(amount);
        uint underlyingBalance = IERC20(asset).balanceOf(address(this));
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
    /// @param token Token address
    /// @param amount Token amount
    function salvage(address token, uint amount) external onlyControllerOrGovernance {
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}