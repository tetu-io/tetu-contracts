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

library ZapV2Balancer2Library {
    using SafeERC20 for IERC20;

    address private constant TETUBAL = 0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33;
    bytes32 private constant TETUBAL_WETHBAL_POOL_ID = 0xb797adfb7b268faeaa90cadbfed464c76ee599cd0002000000000000000005ba;
    address private constant WETH20BAL80_BPT = 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f;
    bytes32 private constant WETH20BAL80_POOL_ID = 0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f000200000000000000000426;
    address private constant WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address private constant BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;
    address private constant TETUQI_QI_VAULT = 0x190cA39f86ea92eaaF19cB2acCA17F8B2718ed58;
    address private constant TETUQI_QI_BPT = 0x05F21bAcc4Fd8590D1eaCa9830a64B66a733316C;
    bytes32 private constant TETUQI_QI_POOL_ID = 0x05f21bacc4fd8590d1eaca9830a64b66a733316c00000000000000000000087e;
    address private constant TETUQI = 0x4Cd44ced63d9a6FEF595f6AD3F7CED13fCEAc768;
    address private constant QI = 0x580A84C73811E1839F75d86d75d88cCa0c241fF4;

    function zapIntoBalancerTetuBal(
        address tokenIn,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint tokenInAmount
    ) external {
        require(tokenInAmount > 1, "ZC: not enough amount");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

        if (tokenIn != WETH) {
            ZapV2CommonLibrary._callOneInchSwap(
                tokenIn,
                tokenInAmount * 2 / 10,
                asset0SwapData
            );
        }

        if (tokenIn != BAL) {
            ZapV2CommonLibrary._callOneInchSwap(
                tokenIn,
                tokenInAmount * 8 / 10,
                asset1SwapData
            );
        }

        address[] memory assets = new address[](2);
        assets[0] = WETH;
        assets[1] = BAL;
        uint[] memory amounts = new uint[](2);
        amounts[0] = IERC20(WETH).balanceOf(address(this));
        amounts[1] = IERC20(BAL).balanceOf(address(this));
        ZapV2BalancerCommonLibrary._addLiquidityBalancer(WETH20BAL80_POOL_ID, assets, amounts, WETH20BAL80_BPT);
        uint bptBalance = IERC20(WETH20BAL80_BPT).balanceOf(address(this));
        (, uint[] memory tetuBalWethBalPoolBalances,) = IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).getPoolTokens(TETUBAL_WETHBAL_POOL_ID);
        uint canBuyTetuBalBPTByGoodPrice = tetuBalWethBalPoolBalances[1] > tetuBalWethBalPoolBalances[0] ? (tetuBalWethBalPoolBalances[1] - tetuBalWethBalPoolBalances[0]) / 2 : 0;
        uint needToMintTetuBal;
        if (canBuyTetuBalBPTByGoodPrice < bptBalance) {
            needToMintTetuBal = bptBalance - canBuyTetuBalBPTByGoodPrice;
        }
        if (needToMintTetuBal != 0) {
            ZapV2CommonLibrary._approveIfNeeds(WETH20BAL80_BPT, needToMintTetuBal, TETUBAL);
            ISmartVault(TETUBAL).depositAndInvest(needToMintTetuBal);
        }
        ZapV2BalancerCommonLibrary._balancerSwap(TETUBAL_WETHBAL_POOL_ID, WETH20BAL80_BPT, TETUBAL, bptBalance - needToMintTetuBal);
        uint tetuBalBalance = IERC20(TETUBAL).balanceOf(address(this));
        require(tetuBalBalance != 0, "ZC: zero shareBalance");
        IERC20(TETUBAL).safeTransfer(msg.sender, tetuBalBalance);

        address[] memory dustAssets = new address[](4);
        dustAssets[0] = tokenIn;
        dustAssets[1] = WETH20BAL80_BPT;
        dustAssets[2] = WETH;
        dustAssets[3] = BAL;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
    }

    function zapOutBalancerTetuBal(
        address tokenOut,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint shareAmount
    ) external {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(TETUBAL).safeTransferFrom(msg.sender, address(this), shareAmount);
        ZapV2BalancerCommonLibrary._balancerSwap(TETUBAL_WETHBAL_POOL_ID, TETUBAL, WETH20BAL80_BPT, shareAmount);

        uint[] memory amounts = new uint[](2);
        address[] memory assets = new address[](2);
        assets[0] = WETH;
        assets[1] = BAL;
        uint[] memory amountsOut = ZapV2BalancerCommonLibrary._removeLiquidityBalancer(WETH20BAL80_POOL_ID, assets, amounts, IERC20(WETH20BAL80_BPT).balanceOf(address(this)));
        if (tokenOut != WETH) {
            ZapV2CommonLibrary._callOneInchSwap(
                WETH,
                amountsOut[0],
                asset0SwapData
            );
        }

        if (tokenOut != BAL) {
            ZapV2CommonLibrary._callOneInchSwap(
                BAL,
                amountsOut[1],
                asset1SwapData
            );
        }

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);

        address[] memory dustAssets = new address[](4);
        dustAssets[0] = WETH20BAL80_BPT;
        dustAssets[1] = WETH;
        dustAssets[2] = BAL;
        dustAssets[3] = TETUBAL;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
    }

    function zapIntoBalancerTetuQiQi(
        address tokenIn,
        bytes memory assetSwapData,
        uint tokenInAmount
    ) external {
        require(tokenInAmount > 1, "ZC: not enough amount");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

        ZapV2CommonLibrary._callOneInchSwap(
            tokenIn,
            tokenInAmount,
            assetSwapData
        );

        uint qiBal = IERC20(QI).balanceOf(address(this));

        (, uint[] memory tetuQiQiPoolBalances,) = IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).getPoolTokens(TETUQI_QI_POOL_ID);
        uint canBuyTetuQiByGoodPrice = tetuQiQiPoolBalances[1] > tetuQiQiPoolBalances[2] ? (tetuQiQiPoolBalances[1] - tetuQiQiPoolBalances[2]) / 2 : 0;
        uint needToMintTetuQi;
        if (canBuyTetuQiByGoodPrice < qiBal / 2) {
            needToMintTetuQi = qiBal / 2 - canBuyTetuQiByGoodPrice;
        }
        if (needToMintTetuQi != 0) {
            ZapV2CommonLibrary._approveIfNeeds(QI, needToMintTetuQi, TETUQI);
            ISmartVault(TETUQI).depositAndInvest(needToMintTetuQi);
        }

        address[] memory assets = new address[](3);
        assets[0] = TETUQI_QI_BPT;
        assets[1] = TETUQI;
        assets[2] = QI;
        uint[] memory amounts = new uint[](3);
        if (needToMintTetuQi != 0) {
            amounts[1] = IERC20(TETUQI).balanceOf(address(this));
        }
        amounts[2] = IERC20(QI).balanceOf(address(this));
        ZapV2BalancerCommonLibrary._addLiquidityBalancer(TETUQI_QI_POOL_ID, assets, amounts, TETUQI_QI_BPT);

        ZapV2CommonLibrary._depositToVault(TETUQI_QI_VAULT, TETUQI_QI_BPT, IERC20(TETUQI_QI_BPT).balanceOf(address(this)));

        address[] memory dustAssets = new address[](4);
        dustAssets[0] = TETUQI_QI_BPT;
        dustAssets[1] = TETUQI;
        dustAssets[2] = QI;
        dustAssets[3] = tokenIn;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
    }

    function zapOutBalancerTetuQiQi(
        address tokenOut,
        bytes memory assetSwapData,
        uint shareAmount
    ) external {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(TETUQI_QI_VAULT).safeTransferFrom(msg.sender, address(this), shareAmount);
        uint bptAmount = ZapV2CommonLibrary._withdrawFromVault(TETUQI_QI_VAULT, TETUQI_QI_BPT, shareAmount);
        IAsset[] memory assets = new IAsset[](3);
        assets[0] = IAsset(TETUQI_QI_BPT);
        assets[1] = IAsset(TETUQI);
        assets[2] = IAsset(QI);
        uint[] memory amounts = new uint[](3);
        IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).exitPool(
            TETUQI_QI_POOL_ID,
            address(this),
            payable(address(this)),
            IBVault.ExitPoolRequest({
                assets : assets,
                minAmountsOut : amounts,
                userData : abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptAmount, 1),
                toInternalBalance : false
            })
        );

        ZapV2CommonLibrary._callOneInchSwap(
            QI,
            IERC20(QI).balanceOf(address(this)),
            assetSwapData
        );

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);

        address[] memory dustAssets = new address[](4);
        dustAssets[0] = TETUQI_QI_BPT;
        dustAssets[1] = TETUQI;
        dustAssets[2] = QI;
        dustAssets[3] = TETUQI_QI_VAULT;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
    }

    function quoteIntoBalancerTetuBal(uint wethAmount, uint balAmount) external returns(uint) {
        uint[] memory amounts = new uint[](2);
        amounts[0] = wethAmount;
        amounts[1] = balAmount;

        address[] memory assets = new address[](2);
        assets[0] = WETH;
        assets[1] = BAL;

        uint bptOut = ZapV2BalancerCommonLibrary._quoteJoinBalancer(WETH20BAL80_POOL_ID, assets, amounts, WETH20BAL80_BPT);
        (, uint[] memory tetuBalWethBalPoolBalances,) = IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).getPoolTokens(TETUBAL_WETHBAL_POOL_ID);
        uint canBuyTetuBalBPTByGoodPrice = tetuBalWethBalPoolBalances[1] > tetuBalWethBalPoolBalances[0] ? (tetuBalWethBalPoolBalances[1] - tetuBalWethBalPoolBalances[0]) / 2 : 0;
        uint needToMintTetuBal;
        if (canBuyTetuBalBPTByGoodPrice < bptOut) {
            needToMintTetuBal = bptOut - canBuyTetuBalBPTByGoodPrice;
        }

        uint swapOut = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(TETUBAL_WETHBAL_POOL_ID, 0, 1, bptOut - needToMintTetuBal);

        return swapOut + needToMintTetuBal;
    }

    function quoteOutBalancerTetuBal(uint amount) external returns(uint[] memory) {
        uint wethBalBpt = ZapV2BalancerCommonLibrary._queryBalancerSingleSwap(TETUBAL_WETHBAL_POOL_ID, 1, 0, amount);
        address[] memory assets = new address[](2);
        assets[0] = WETH;
        assets[1] = BAL;
        uint[] memory amounts = new uint[](2);
        (, uint[] memory amountsOut) = IBalancerHelper(ZapV2BalancerCommonLibrary.BALANCER_HELPER).queryExit(
            WETH20BAL80_POOL_ID,
            address(this),
            payable(address(this)),
            IVault.JoinPoolRequest({
                assets : assets,
                maxAmountsIn : amounts,
                userData : abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_TOKENS_OUT, wethBalBpt),
                fromInternalBalance : false
            })
        );

        return amountsOut;
    }

    function quoteIntoBalancerTetuQiQi(uint qiAmount) external returns(uint) {
        (, uint[] memory tetuQiQiPoolBalances,) = IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).getPoolTokens(TETUQI_QI_POOL_ID);
        uint canBuyTetuQiByGoodPrice = tetuQiQiPoolBalances[1] > tetuQiQiPoolBalances[2] ? (tetuQiQiPoolBalances[1] - tetuQiQiPoolBalances[2]) / 2 : 0;
        uint needToMintTetuQi;
        if (canBuyTetuQiByGoodPrice < qiAmount / 2) {
            needToMintTetuQi = qiAmount / 2 - canBuyTetuQiByGoodPrice;
        }
        address[] memory assets = new address[](3);
        assets[0] = TETUQI_QI_BPT;
        assets[1] = TETUQI;
        assets[2] = QI;
        uint[] memory amounts = new uint[](3);
        amounts[1] = needToMintTetuQi;
        amounts[2] = qiAmount;
        uint bptOut = ZapV2BalancerCommonLibrary._quoteJoinBalancer(TETUQI_QI_POOL_ID, assets, amounts, TETUQI_QI_BPT);
        return bptOut * IERC20(TETUQI_QI_VAULT).totalSupply() / ISmartVault(TETUQI_QI_VAULT).underlyingBalanceWithInvestment();
    }

    function quoteOutBalancerTetuQiQi(uint shareAmount) external returns(uint) {
        uint bptOut = shareAmount * ISmartVault(TETUQI_QI_VAULT).underlyingBalanceWithInvestment() / IERC20(TETUQI_QI_VAULT).totalSupply();
        address[] memory assets = new address[](3);
        assets[0] = TETUQI_QI_BPT;
        assets[1] = TETUQI;
        assets[2] = QI;
        uint[] memory amounts = new uint[](3);
        (, uint[] memory amountsOut) = IBalancerHelper(ZapV2BalancerCommonLibrary.BALANCER_HELPER).queryExit(
            TETUQI_QI_POOL_ID,
            address(this),
            payable(address(this)),
            IVault.JoinPoolRequest({
                assets : assets,
                maxAmountsIn : amounts,
                userData : abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptOut, 1),
                fromInternalBalance : false
            })
        );
        return amountsOut[2];
    }

    function getBalancerPoolTokens(address bpt) external view returns(
        IERC20[] memory,
        uint[] memory
    ) {
        bytes32 poolId = IBPT(bpt).getPoolId();
        (IERC20[] memory tokens, uint[] memory balances,) = IBVault(ZapV2BalancerCommonLibrary.BALANCER_VAULT).getPoolTokens(poolId);
        return (tokens, balances);
    }
}



