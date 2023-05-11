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
import "./ZapV2CommonLibrary.sol";
import "./ZapV2BalancerCommonLibrary.sol";

/// @title Able to zap in/out assets to xtetuBAL vault
/// @author a17
contract ZapV2XTetuBal is Controllable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address private constant XTETUBAL = 0x915E49F7CD8B2b5763759c23D9463A74d5b5C1D5;
    address private constant TETUBAL = 0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33;
    bytes32 private constant TETUBAL_WETHBAL_POOL_ID = 0xb797adfb7b268faeaa90cadbfed464c76ee599cd0002000000000000000005ba;
    address private constant WETH20BAL80_BPT = 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f;
    bytes32 private constant WETH20BAL80_POOL_ID = 0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f000200000000000000000426;
    address private constant WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address private constant BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;

    string public constant VERSION = "1.0.0";
    mapping(address => uint) private calls;

    constructor(address controller_) {
        Controllable.initializeControllable(controller_);
    }

    modifier onlyOneCallPerBlock() {
        require(calls[msg.sender] < block.number, "ZC: call in the same block forbidden");
        _;
        calls[msg.sender] = block.number;
    }

    function zapInto(
        address tokenIn,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
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
        require(tetuBalBalance != 0, "ZC: zero tetuBAL");

        ZapV2CommonLibrary._approveIfNeeds(TETUBAL, tetuBalBalance, XTETUBAL);
        ISmartVault(XTETUBAL).depositAndInvest(tetuBalBalance);

        uint xtetuBalBalance = IERC20(XTETUBAL).balanceOf(address(this));
        require(xtetuBalBalance != 0, "ZC: zero xtetuBAL");

        IERC20(XTETUBAL).safeTransfer(msg.sender, xtetuBalBalance);

        address[] memory dustAssets = new address[](4);
        dustAssets[0] = tokenIn;
        dustAssets[1] = WETH20BAL80_BPT;
        dustAssets[2] = WETH;
        dustAssets[3] = BAL;
        ZapV2CommonLibrary._sendBackChange(dustAssets);
    }

    function zapOut(
        address tokenOut,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(XTETUBAL).safeTransferFrom(msg.sender, address(this), shareAmount);

        uint assetBalance = ZapV2CommonLibrary._withdrawFromVault(XTETUBAL, TETUBAL, shareAmount);

        ZapV2BalancerCommonLibrary._balancerSwap(TETUBAL_WETHBAL_POOL_ID, TETUBAL, WETH20BAL80_BPT, assetBalance);

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

    function quoteInto(uint wethAmount, uint balAmount) external returns(uint) {
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

        return (swapOut + needToMintTetuBal) * IERC20(XTETUBAL).totalSupply() / ISmartVault(XTETUBAL).underlyingBalanceWithInvestment();
    }

    function quoteOut(uint shareAmount) external returns(uint[] memory) {
        uint amount = shareAmount * ISmartVault(XTETUBAL).underlyingBalanceWithInvestment() / IERC20(XTETUBAL).totalSupply();

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
}
