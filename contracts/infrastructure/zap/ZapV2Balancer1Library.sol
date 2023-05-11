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
import "../../base/interfaces/ISmartVault.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../third_party/balancer/IBPT.sol";
import "../../third_party/balancer/IBalancerHelper.sol";
import "./ZapV2CommonLibrary.sol";
import "./ZapV2BalancerCommonLibrary.sol";


library ZapV2Balancer1Library {
    using SafeERC20 for IERC20;

    address private constant BB_AM_USD_VAULT = 0xf2fB1979C4bed7E71E6ac829801E0A8a4eFa8513;
    address private constant BB_AM_USD_BPT = 0x48e6B98ef6329f8f0A30eBB8c7C960330d648085;
    bytes32 private constant BB_AM_USD_POOL_ID = 0x48e6b98ef6329f8f0a30ebb8c7c960330d64808500000000000000000000075b;
    address private constant BB_AM_USD_POOL0_BPT = 0x178E029173417b1F9C8bC16DCeC6f697bC323746; // Balancer Aave Boosted Pool (DAI) (bb-am-DAI)
    address private constant BB_AM_USD_POOL2_BPT = 0xF93579002DBE8046c43FEfE86ec78b1112247BB8; // Balancer Aave Boosted Pool (USDC) (bb-am-USDC)
    address private constant BB_AM_USD_POOL3_BPT = 0xFf4ce5AAAb5a627bf82f4A571AB1cE94Aa365eA6; // Balancer Aave Boosted Pool (USDT) (bb-am-USDT)
    bytes32 private constant BB_AM_USD_POOL0_ID = 0x178e029173417b1f9c8bc16dcec6f697bc323746000000000000000000000758;
    bytes32 private constant BB_AM_USD_POOL2_ID = 0xf93579002dbe8046c43fefe86ec78b1112247bb8000000000000000000000759;
    bytes32 private constant BB_AM_USD_POOL3_ID = 0xff4ce5aaab5a627bf82f4a571ab1ce94aa365ea600000000000000000000075a;
    address private constant BB_AM_USD_POOL0_TOKEN1 = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063; // DAI
    address private constant BB_AM_USD_POOL2_TOKEN1 = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174; // USDC
    address private constant BB_AM_USD_POOL3_TOKEN1 = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F; // USDT

    function zapIntoBalancer(
        address vault,
        address tokenIn,
        address[] memory assets,
        bytes[] memory assetsSwapData,
        uint[] memory tokenInAmounts
    ) external {
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
            if (tokenInAmounts[i] != 0) {
                if (tokenIn != assets[i]) {
                    ZapV2CommonLibrary._callOneInchSwap(
                        tokenIn,
                        tokenInAmounts[i],
                        assetsSwapData[i]
                    );
                    amounts[i] = IERC20(assets[i]).balanceOf(address(this));
                } else {
                    amounts[i] = tokenInAmounts[i];
                }
            }
        }

        ZapV2BalancerCommonLibrary._addLiquidityBalancer(poolId, assets, amounts, bpt);

        uint bptBalance = IERC20(bpt).balanceOf(address(this));

        require(bptBalance != 0, "ZC: zero liq");

        ZapV2CommonLibrary._depositToVault(vault, bpt, bptBalance);

        address[] memory dustAssets = new address[](2);
        dustAssets[0] = tokenIn;
        dustAssets[1] = bpt;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
        ZapV2CommonLibrary._sendBackChange(assets);
    }

    function zapOutBalancer(
        address vault,
        address tokenOut,
        address[] memory assets,
        uint[] memory amounts,
        bytes[] memory assetsSwapData,
        uint shareAmount
    ) external {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(vault).safeTransferFrom(msg.sender, address(this), shareAmount);
        address bpt = ISmartVault(vault).underlying();
        bytes32 poolId = IBPT(bpt).getPoolId();

        uint bptOut = ZapV2CommonLibrary._withdrawFromVault(vault, bpt, shareAmount);

        uint len = assets.length;

        uint[] memory amountsOut = ZapV2BalancerCommonLibrary._removeLiquidityBalancer(poolId, assets, amounts, bptOut);

        for (uint i; i < len; i++) {
            if (assets[i] != bpt && amountsOut[i] != 0 && tokenOut != assets[i]) {
                ZapV2CommonLibrary._callOneInchSwap(
                    assets[i],
                    amountsOut[i],
                    assetsSwapData[i]
                );
            }
        }

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);

        address[] memory dustAssets = new address[](2);
        dustAssets[0] = bpt;
        dustAssets[1] = vault;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
        ZapV2CommonLibrary._sendBackChange(assets);
    }

    function zapIntoBalancerAaveBoostedStablePool(
        address tokenIn,
        bytes[] memory assetsSwapData,
        uint[] memory tokenInAmounts // calculated off-chain
    ) external {
        uint totalTokenInAmount = tokenInAmounts[0] + tokenInAmounts[1] + tokenInAmounts[2];
        require(totalTokenInAmount > 1, "ZC: not enough amount");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), totalTokenInAmount);

        // swap to DAI
        if (tokenIn != BB_AM_USD_POOL0_TOKEN1) {
            ZapV2CommonLibrary._callOneInchSwap(
                tokenIn,
                tokenInAmounts[0],
                assetsSwapData[0]
            );
        }

        // swap to USDC
        if (tokenIn != BB_AM_USD_POOL2_TOKEN1) {
            ZapV2CommonLibrary._callOneInchSwap(
                tokenIn,
                tokenInAmounts[1],
                assetsSwapData[1]
            );
        }

        // swap to USDT
        if (tokenIn != BB_AM_USD_POOL3_TOKEN1) {
            ZapV2CommonLibrary._callOneInchSwap(
                tokenIn,
                tokenInAmounts[2],
                assetsSwapData[2]
            );
        }

        uint[] memory realAssetsAmounts = new uint[](3);
        realAssetsAmounts[0] = IERC20(BB_AM_USD_POOL0_TOKEN1).balanceOf(address(this));
        realAssetsAmounts[1] = IERC20(BB_AM_USD_POOL2_TOKEN1).balanceOf(address(this));
        realAssetsAmounts[2] = IERC20(BB_AM_USD_POOL3_TOKEN1).balanceOf(address(this));

        // get linear pool phantom bpts
        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL0_ID, BB_AM_USD_POOL0_TOKEN1, BB_AM_USD_POOL0_BPT, realAssetsAmounts[0]);
        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL2_ID, BB_AM_USD_POOL2_TOKEN1, BB_AM_USD_POOL2_BPT, realAssetsAmounts[1]);
        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL3_ID, BB_AM_USD_POOL3_TOKEN1, BB_AM_USD_POOL3_BPT, realAssetsAmounts[2]);

        // get root BPT
        address[] memory rootAssets = new address[](4);
        uint[] memory rootAmounts = new uint[](4);
        rootAssets[0] = BB_AM_USD_POOL0_BPT;
        rootAssets[1] = BB_AM_USD_BPT;
        rootAssets[2] = BB_AM_USD_POOL2_BPT;
        rootAssets[3] = BB_AM_USD_POOL3_BPT;
        rootAmounts[0] = IERC20(BB_AM_USD_POOL0_BPT).balanceOf(address(this));
        rootAmounts[1] = 0;
        rootAmounts[2] = IERC20(BB_AM_USD_POOL2_BPT).balanceOf(address(this));
        rootAmounts[3] = IERC20(BB_AM_USD_POOL3_BPT).balanceOf(address(this));
        ZapV2BalancerCommonLibrary._addLiquidityBalancer(BB_AM_USD_POOL_ID, rootAssets, rootAmounts, BB_AM_USD_BPT);

        uint bptBalance = IERC20(BB_AM_USD_BPT).balanceOf(address(this));
        require(bptBalance != 0, "ZC: zero liq");
        ZapV2CommonLibrary._depositToVault(BB_AM_USD_VAULT, BB_AM_USD_BPT, bptBalance);

        address[] memory dustAssets = new address[](8);
        dustAssets[0] = BB_AM_USD_POOL0_BPT;
        dustAssets[1] = BB_AM_USD_BPT;
        dustAssets[2] = BB_AM_USD_POOL2_BPT;
        dustAssets[3] = BB_AM_USD_POOL3_BPT;
        dustAssets[4] = BB_AM_USD_POOL0_TOKEN1;
        dustAssets[5] = BB_AM_USD_POOL2_TOKEN1;
        dustAssets[6] = BB_AM_USD_POOL3_TOKEN1;
        dustAssets[7] = tokenIn;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
    }

    function zapOutBalancerAaveBoostedStablePool(
        address tokenOut,
        bytes[] memory assetsSwapData,
        uint shareAmount
    ) external {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(BB_AM_USD_VAULT).safeTransferFrom(msg.sender, address(this), shareAmount);
        uint bptOut = ZapV2CommonLibrary._withdrawFromVault(BB_AM_USD_VAULT, BB_AM_USD_BPT, shareAmount);

        (, uint[] memory tokensBalances,) = IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).getPoolTokens(BB_AM_USD_POOL_ID);
        uint totalTokenBalances = tokensBalances[0] + tokensBalances[2] + tokensBalances[3];

        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL_ID, BB_AM_USD_BPT, BB_AM_USD_POOL0_BPT, bptOut * tokensBalances[0] / totalTokenBalances);
        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL0_ID, BB_AM_USD_POOL0_BPT, BB_AM_USD_POOL0_TOKEN1, IERC20(BB_AM_USD_POOL0_BPT).balanceOf(address(this)));

        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL_ID, BB_AM_USD_BPT, BB_AM_USD_POOL2_BPT, bptOut * tokensBalances[2] / totalTokenBalances);
        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL2_ID, BB_AM_USD_POOL2_BPT, BB_AM_USD_POOL2_TOKEN1, IERC20(BB_AM_USD_POOL2_BPT).balanceOf(address(this)));

        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL_ID, BB_AM_USD_BPT, BB_AM_USD_POOL3_BPT, bptOut * tokensBalances[3] / totalTokenBalances);
        ZapV2BalancerCommonLibrary._balancerSwap(BB_AM_USD_POOL3_ID, BB_AM_USD_POOL3_BPT, BB_AM_USD_POOL3_TOKEN1, IERC20(BB_AM_USD_POOL3_BPT).balanceOf(address(this)));

        if (tokenOut != BB_AM_USD_POOL0_TOKEN1) {
            ZapV2CommonLibrary._callOneInchSwap(
                BB_AM_USD_POOL0_TOKEN1,
                IERC20(BB_AM_USD_POOL0_TOKEN1).balanceOf(address(this)),
                assetsSwapData[0]
            );
        }

        if (tokenOut != BB_AM_USD_POOL2_TOKEN1) {
            ZapV2CommonLibrary._callOneInchSwap(
                BB_AM_USD_POOL2_TOKEN1,
                IERC20(BB_AM_USD_POOL2_TOKEN1).balanceOf(address(this)),
                assetsSwapData[1]
            );
        }

        if (tokenOut != BB_AM_USD_POOL3_TOKEN1) {
            ZapV2CommonLibrary._callOneInchSwap(
                BB_AM_USD_POOL3_TOKEN1,
                IERC20(BB_AM_USD_POOL3_TOKEN1).balanceOf(address(this)),
                assetsSwapData[2]
            );
        }

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);

        address[] memory dustAssets = new address[](8);
        dustAssets[0] = BB_AM_USD_POOL0_BPT;
        dustAssets[1] = BB_AM_USD_BPT;
        dustAssets[2] = BB_AM_USD_POOL2_BPT;
        dustAssets[3] = BB_AM_USD_POOL3_BPT;
        dustAssets[4] = BB_AM_USD_POOL0_TOKEN1;
        dustAssets[5] = BB_AM_USD_POOL2_TOKEN1;
        dustAssets[6] = BB_AM_USD_POOL3_TOKEN1;
        dustAssets[7] = BB_AM_USD_VAULT;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
    }

    function quoteIntoBalancer(address vault, address[] memory assets, uint[] memory amounts) external returns(uint) {
        address bpt = ISmartVault(vault).underlying();
        bytes32 poolId = IBPT(bpt).getPoolId();
        uint bptOut = ZapV2BalancerCommonLibrary._quoteJoinBalancer(poolId, assets, amounts, bpt);
        return bptOut * IERC20(vault).totalSupply() / ISmartVault(vault).underlyingBalanceWithInvestment();
    }

    /// @dev Quote out for ComposableStablePool with Phantom BPT and without it.
    ///      This unusual algorithm is used due to the impossibility of using EXACT_BPT_IN_FOR_ALL_TOKENS_OUT.
    ///      We think it's can be better than queryBatchSwap for such pools.
    function quoteOutBalancer(address vault, address[] memory assets, uint shareAmount) external view returns(uint[] memory) {
        address bpt = ISmartVault(vault).underlying();
        bytes32 poolId = IBPT(bpt).getPoolId();
        uint bptAmountOut = shareAmount * ISmartVault(vault).underlyingBalanceWithInvestment() / IERC20(vault).totalSupply();
        uint len = assets.length;
        uint bptNotInPool;
        uint i;
        (, uint[] memory tokensBalances,) = IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).getPoolTokens(poolId);
        for (; i < len; i++) {
            if (assets[i] == bpt) {
                bptNotInPool = IERC20(bpt).totalSupply() - tokensBalances[i];
            }
        }

        if (bptNotInPool == 0) {
            bptNotInPool = IERC20(bpt).totalSupply();
        }

        uint[] memory amounts = new uint[](len);
        for (i = 0; i < len; i++) {
            if (assets[i] != bpt) {
                amounts[i] = tokensBalances[i] * bptAmountOut / bptNotInPool * 999998 / 1000000;
            }
        }

        return amounts;
    }

    function quoteIntoBalancerAaveBoostedStablePool(uint[] memory amounts) external returns(uint) {
        uint[] memory rootAmounts = new uint[](4);
        rootAmounts[0] = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL0_ID, 1, 0, amounts[0]);
        rootAmounts[1] = 0;
        rootAmounts[2] = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL2_ID, 1, 2, amounts[1]);
        rootAmounts[3] = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL3_ID, 1, 2, amounts[2]);

        address[] memory rootAssets = new address[](4);
        rootAssets[0] = BB_AM_USD_POOL0_BPT;
        rootAssets[1] = BB_AM_USD_BPT;
        rootAssets[2] = BB_AM_USD_POOL2_BPT;
        rootAssets[3] = BB_AM_USD_POOL3_BPT;

        uint bptOut = ZapV2BalancerCommonLibrary._quoteJoinBalancer(BB_AM_USD_POOL_ID, rootAssets, rootAmounts, BB_AM_USD_BPT);
        return bptOut * IERC20(BB_AM_USD_VAULT).totalSupply() / ISmartVault(BB_AM_USD_VAULT).underlyingBalanceWithInvestment();
    }

    function quoteOutBalancerAaveBoostedStablePool(uint shareAmount) external returns(uint[] memory) {
        uint bptAmountOut = shareAmount * ISmartVault(BB_AM_USD_VAULT).underlyingBalanceWithInvestment() / IERC20(BB_AM_USD_VAULT).totalSupply();
        (, uint[] memory tokensBalances,) = IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).getPoolTokens(BB_AM_USD_POOL_ID);
        uint totalTokenBalances = tokensBalances[0] + tokensBalances[2] + tokensBalances[3];

        uint[] memory outAmounts = new uint[](3);
        uint bptOutTmp;

        bptOutTmp = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL_ID, 1, 0, bptAmountOut * tokensBalances[0] / totalTokenBalances);
        outAmounts[0] = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL0_ID, 0, 1, bptOutTmp);
        bptOutTmp = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL_ID, 1, 2, bptAmountOut * tokensBalances[2] / totalTokenBalances);
        outAmounts[1] = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL2_ID, 2, 1, bptOutTmp);
        bptOutTmp = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL_ID, 1, 3, bptAmountOut * tokensBalances[3] / totalTokenBalances);
        outAmounts[2] = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(BB_AM_USD_POOL3_ID, 2, 1, bptOutTmp);

        return outAmounts;
    }
}
