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

/// @title The second generation of dedicated solution for interacting with Tetu vaults.
///        Able to zap in/out assets to vaults.
/// @author a17
contract ZapV2 is Controllable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";
    address public constant ONEINCH_ROUTER = 0x1111111254fb6c44bAC0beD2854e76F90643097d;
    address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address public constant BALANCER_HELPER = 0x239e55F427D44C3cc793f49bFB507ebe76638a2b;

    address public constant BB_AM_USD_VAULT = 0xf2fB1979C4bed7E71E6ac829801E0A8a4eFa8513;
    address public constant BB_AM_USD_BPT = 0x48e6B98ef6329f8f0A30eBB8c7C960330d648085;
    bytes32 public constant BB_AM_USD_POOL_ID = 0x48e6b98ef6329f8f0a30ebb8c7c960330d64808500000000000000000000075b;
    address public constant BB_AM_USD_POOL0_BPT = 0x178E029173417b1F9C8bC16DCeC6f697bC323746; // Balancer Aave Boosted Pool (DAI) (bb-am-DAI)
    address public constant BB_AM_USD_POOL2_BPT = 0xF93579002DBE8046c43FEfE86ec78b1112247BB8; // Balancer Aave Boosted Pool (USDC) (bb-am-USDC)
    address public constant BB_AM_USD_POOL3_BPT = 0xFf4ce5AAAb5a627bf82f4A571AB1cE94Aa365eA6; // Balancer Aave Boosted Pool (USDT) (bb-am-USDT)
    bytes32 public constant BB_AM_USD_POOL0_ID = 0x178e029173417b1f9c8bc16dcec6f697bc323746000000000000000000000758;
    bytes32 public constant BB_AM_USD_POOL2_ID = 0xf93579002dbe8046c43fefe86ec78b1112247bb8000000000000000000000759;
    bytes32 public constant BB_AM_USD_POOL3_ID = 0xff4ce5aaab5a627bf82f4a571ab1ce94aa365ea600000000000000000000075a;
    address public constant BB_AM_USD_POOL0_TOKEN1 = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063; // DAI
    address public constant BB_AM_USD_POOL2_TOKEN1 = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174; // USDC
    address public constant BB_AM_USD_POOL3_TOKEN1 = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F; // USDT
    address public constant TETUBAL = 0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33;
    bytes32 public constant TETUBAL_WETHBAL_POOL_ID = 0xb797adfb7b268faeaa90cadbfed464c76ee599cd0002000000000000000005ba;
    address public constant WETH20BAL80_BPT = 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f;
    bytes32 public constant WETH20BAL80_POOL_ID = 0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f000200000000000000000426;
    address public constant WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address public constant BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;
    address public constant TETUQI_QI_VAULT = 0x190cA39f86ea92eaaF19cB2acCA17F8B2718ed58;
    address public constant TETUQI_QI_BPT = 0x05F21bAcc4Fd8590D1eaCa9830a64B66a733316C;
    bytes32 public constant TETUQI_QI_POOL_ID = 0x05f21bacc4fd8590d1eaca9830a64b66a733316c00000000000000000000087e;
    address public constant TETUQI = 0x4Cd44ced63d9a6FEF595f6AD3F7CED13fCEAc768;
    address public constant QI = 0x580A84C73811E1839F75d86d75d88cCa0c241fF4;

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

        address[] memory dustAssets = new address[](1);
        dustAssets[0] = asset;
        _sendBackChange(dustAssets);
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

        address[] memory dustAssets = new address[](2);
        dustAssets[0] = asset0;
        dustAssets[1] = asset1;
        _sendBackChange(dustAssets);
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

        address[] memory dustAssets = new address[](2);
        dustAssets[0] = asset0;
        dustAssets[1] = asset1;
        _sendBackChange(dustAssets);
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
            if (tokenInAmounts[i] != 0) {
                if (tokenIn != assets[i]) {
                    _callOneInchSwap(
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

        _addLiquidityBalancer(poolId, assets, amounts, bpt);

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

        _sendBackChange(assets);
    }

    function zapIntoBalancerAaveBoostedStablePool(
        address tokenIn,
        bytes[] memory assetsSwapData,
        uint[] memory tokenInAmounts // calculated off-chain
    ) external nonReentrant onlyOneCallPerBlock {
        uint totalTokenInAmount = tokenInAmounts[0] + tokenInAmounts[1] + tokenInAmounts[2];
        require(totalTokenInAmount > 1, "ZC: not enough amount");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), totalTokenInAmount);

        // swap to DAI
        if (tokenIn != BB_AM_USD_POOL0_TOKEN1) {
            _callOneInchSwap(
                tokenIn,
                tokenInAmounts[0],
                assetsSwapData[0]
            );
        }

        // swap to USDC
        if (tokenIn != BB_AM_USD_POOL2_TOKEN1) {
            _callOneInchSwap(
                tokenIn,
                tokenInAmounts[1],
                assetsSwapData[1]
            );
        }

        // swap to USDT
        if (tokenIn != BB_AM_USD_POOL3_TOKEN1) {
            _callOneInchSwap(
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
        _balancerSwap(BB_AM_USD_POOL0_ID, BB_AM_USD_POOL0_TOKEN1, BB_AM_USD_POOL0_BPT, realAssetsAmounts[0]);
        _balancerSwap(BB_AM_USD_POOL2_ID, BB_AM_USD_POOL2_TOKEN1, BB_AM_USD_POOL2_BPT, realAssetsAmounts[1]);
        _balancerSwap(BB_AM_USD_POOL3_ID, BB_AM_USD_POOL3_TOKEN1, BB_AM_USD_POOL3_BPT, realAssetsAmounts[2]);

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
        _addLiquidityBalancer(BB_AM_USD_POOL_ID, rootAssets, rootAmounts, BB_AM_USD_BPT);

        uint bptBalance = IERC20(BB_AM_USD_BPT).balanceOf(address(this));
        require(bptBalance != 0, "ZC: zero liq");
        _depositToVault(BB_AM_USD_VAULT, BB_AM_USD_BPT, bptBalance);
    }

    function zapOutBalancerAaveBoostedStablePool(
        address tokenOut,
        bytes[] memory assetsSwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(BB_AM_USD_VAULT).safeTransferFrom(msg.sender, address(this), shareAmount);
        uint bptOut = _withdrawFromVault(BB_AM_USD_VAULT, BB_AM_USD_BPT, shareAmount);

        (, uint[] memory tokensBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(BB_AM_USD_POOL_ID);
        uint totalTokenBalances = tokensBalances[0] + tokensBalances[2] + tokensBalances[3];

        _balancerSwap(BB_AM_USD_POOL_ID, BB_AM_USD_BPT, BB_AM_USD_POOL0_BPT, bptOut * tokensBalances[0] / totalTokenBalances);
        _balancerSwap(BB_AM_USD_POOL0_ID, BB_AM_USD_POOL0_BPT, BB_AM_USD_POOL0_TOKEN1, IERC20(BB_AM_USD_POOL0_BPT).balanceOf(address(this)));

        _balancerSwap(BB_AM_USD_POOL_ID, BB_AM_USD_BPT, BB_AM_USD_POOL2_BPT, bptOut * tokensBalances[2] / totalTokenBalances);
        _balancerSwap(BB_AM_USD_POOL2_ID, BB_AM_USD_POOL2_BPT, BB_AM_USD_POOL2_TOKEN1, IERC20(BB_AM_USD_POOL2_BPT).balanceOf(address(this)));

        _balancerSwap(BB_AM_USD_POOL_ID, BB_AM_USD_BPT, BB_AM_USD_POOL3_BPT, bptOut * tokensBalances[3] / totalTokenBalances);
        _balancerSwap(BB_AM_USD_POOL3_ID, BB_AM_USD_POOL3_BPT, BB_AM_USD_POOL3_TOKEN1, IERC20(BB_AM_USD_POOL3_BPT).balanceOf(address(this)));

        if (tokenOut != BB_AM_USD_POOL0_TOKEN1) {
            _callOneInchSwap(
                BB_AM_USD_POOL0_TOKEN1,
                IERC20(BB_AM_USD_POOL0_TOKEN1).balanceOf(address(this)),
                assetsSwapData[0]
            );
        }

        if (tokenOut != BB_AM_USD_POOL2_TOKEN1) {
            _callOneInchSwap(
                BB_AM_USD_POOL2_TOKEN1,
                IERC20(BB_AM_USD_POOL2_TOKEN1).balanceOf(address(this)),
                assetsSwapData[1]
            );
        }

        if (tokenOut != BB_AM_USD_POOL3_TOKEN1) {
            _callOneInchSwap(
                BB_AM_USD_POOL3_TOKEN1,
                IERC20(BB_AM_USD_POOL3_TOKEN1).balanceOf(address(this)),
                assetsSwapData[2]
            );
        }

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);

        address[] memory assets = new address[](4);
        assets[0] = BB_AM_USD_BPT;
        assets[1] = BB_AM_USD_POOL0_TOKEN1;
        assets[2] = BB_AM_USD_POOL2_TOKEN1;
        assets[3] = BB_AM_USD_POOL3_TOKEN1;
        _sendBackChange(assets);
    }

    function zapIntoBalancerTetuBal(
        address tokenIn,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(tokenInAmount > 1, "ZC: not enough amount");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

        if (tokenIn != WETH) {
            _callOneInchSwap(
                tokenIn,
                tokenInAmount * 2 / 10,
                asset0SwapData
            );
        }

        if (tokenIn != BAL) {
            _callOneInchSwap(
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
        _addLiquidityBalancer(WETH20BAL80_POOL_ID, assets, amounts, WETH20BAL80_BPT);
        uint bptBalance = IERC20(WETH20BAL80_BPT).balanceOf(address(this));
        (, uint[] memory tetuBalWethBalPoolBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(TETUBAL_WETHBAL_POOL_ID);
        uint canBuyTetuBalBPTByGoodPrice = tetuBalWethBalPoolBalances[1] > tetuBalWethBalPoolBalances[0] ? (tetuBalWethBalPoolBalances[1] - tetuBalWethBalPoolBalances[0]) / 2 : 0;
        uint needToMintTetuBal;
        if (canBuyTetuBalBPTByGoodPrice < bptBalance) {
            needToMintTetuBal = bptBalance - canBuyTetuBalBPTByGoodPrice;
        }
        if (needToMintTetuBal != 0) {
            _approveIfNeeds(WETH20BAL80_BPT, needToMintTetuBal, TETUBAL);
            ISmartVault(TETUBAL).depositAndInvest(needToMintTetuBal);
        }
        _balancerSwap(TETUBAL_WETHBAL_POOL_ID, WETH20BAL80_BPT, TETUBAL, bptBalance - needToMintTetuBal);
        uint tetuBalBalance = IERC20(TETUBAL).balanceOf(address(this));
        require(tetuBalBalance != 0, "ZC: zero shareBalance");
        IERC20(TETUBAL).safeTransfer(msg.sender, tetuBalBalance);
    }

    function zapOutBalancerTetuBal(
        address tokenOut,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(TETUBAL).safeTransferFrom(msg.sender, address(this), shareAmount);
        _balancerSwap(TETUBAL_WETHBAL_POOL_ID, TETUBAL, WETH20BAL80_BPT, shareAmount);

        uint[] memory amounts = new uint[](2);
        address[] memory assets = new address[](2);
        assets[0] = WETH;
        assets[1] = BAL;
        uint[] memory amountsOut = _removeLiquidityBalancer(WETH20BAL80_POOL_ID, assets, amounts, IERC20(WETH20BAL80_BPT).balanceOf(address(this)));
        if (tokenOut != WETH) {
            _callOneInchSwap(
                WETH,
                amountsOut[0],
                asset0SwapData
            );
        }

        if (tokenOut != BAL) {
            _callOneInchSwap(
                BAL,
                amountsOut[1],
                asset1SwapData
            );
        }

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);
    }

    function zapIntoBalancerTetuQiQi(
        address tokenIn,
        bytes memory assetSwapData,
        uint tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(tokenInAmount > 1, "ZC: not enough amount");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), tokenInAmount);

        _callOneInchSwap(
            tokenIn,
            tokenInAmount,
            assetSwapData
        );

        uint qiBal = IERC20(QI).balanceOf(address(this));

        (, uint[] memory tetuQiQiPoolBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(TETUQI_QI_POOL_ID);
        uint canBuyTetuQiByGoodPrice = tetuQiQiPoolBalances[1] > tetuQiQiPoolBalances[2] ? (tetuQiQiPoolBalances[1] - tetuQiQiPoolBalances[2]) / 2 : 0;
        uint needToMintTetuQi;
        if (canBuyTetuQiByGoodPrice < qiBal / 2) {
            needToMintTetuQi = qiBal / 2 - canBuyTetuQiByGoodPrice;
        }
        if (needToMintTetuQi != 0) {
            _approveIfNeeds(QI, needToMintTetuQi, TETUQI);
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
        _addLiquidityBalancer(TETUQI_QI_POOL_ID, assets, amounts, TETUQI_QI_BPT);

        _depositToVault(TETUQI_QI_VAULT, TETUQI_QI_BPT, IERC20(TETUQI_QI_BPT).balanceOf(address(this)));
    }

    function zapOutBalancerTetuQiQi(
        address tokenOut,
        bytes memory assetSwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(shareAmount != 0, "ZC: zero amount");
        IERC20(TETUQI_QI_VAULT).safeTransferFrom(msg.sender, address(this), shareAmount);
        uint bptAmount = _withdrawFromVault(TETUQI_QI_VAULT, TETUQI_QI_BPT, shareAmount);
        IAsset[] memory assets = new IAsset[](3);
        assets[0] = IAsset(TETUQI_QI_BPT);
        assets[1] = IAsset(TETUQI);
        assets[2] = IAsset(QI);
        uint[] memory amounts = new uint[](3);
        IBVault(BALANCER_VAULT).exitPool(
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

        _callOneInchSwap(
            QI,
            IERC20(QI).balanceOf(address(this)),
            assetSwapData
        );

        uint tokenOutBalance = IERC20(tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(tokenOut).safeTransfer(msg.sender, tokenOutBalance);
    }

    // ******************** QUOTE HELPERS *********************

    function quoteIntoSingle(address vault, uint amount) external view returns(uint) {
        return amount * IERC20(vault).totalSupply() / ISmartVault(vault).underlyingBalanceWithInvestment();
    }

    function quoteOutSingle(address vault, uint shareAmount) external view returns(uint) {
        /// @dev -1 need for stable zapOuts on all supported SmartVaults
        return shareAmount * ISmartVault(vault).underlyingBalanceWithInvestment() / IERC20(vault).totalSupply() - 1;
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

    /// @dev Quote out for ComposableStablePool with Phantom BPT.
    ///      This unusual algorithm is used due to the impossibility of using EXACT_BPT_IN_FOR_ALL_TOKENS_OUT.
    ///      We think it's can be better than queryBatchSwap for such pools.
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

    function quoteIntoBalancerAaveBoostedStablePool(uint[] memory amounts) external returns(uint) {
        uint[] memory rootAmounts = new uint[](4);
        rootAmounts[0] = _queryBalancerSingleSwap(BB_AM_USD_POOL0_ID, 1, 0, amounts[0]);
        rootAmounts[1] = 0;
        rootAmounts[2] = _queryBalancerSingleSwap(BB_AM_USD_POOL2_ID, 1, 2, amounts[1]);
        rootAmounts[3] = _queryBalancerSingleSwap(BB_AM_USD_POOL3_ID, 1, 2, amounts[2]);

        address[] memory rootAssets = new address[](4);
        rootAssets[0] = BB_AM_USD_POOL0_BPT;
        rootAssets[1] = BB_AM_USD_BPT;
        rootAssets[2] = BB_AM_USD_POOL2_BPT;
        rootAssets[3] = BB_AM_USD_POOL3_BPT;

        uint bptOut = _quoteJoinBalancer(BB_AM_USD_POOL_ID, rootAssets, rootAmounts);
        return bptOut * IERC20(BB_AM_USD_VAULT).totalSupply() / ISmartVault(BB_AM_USD_VAULT).underlyingBalanceWithInvestment();
    }

    function quoteOutBalancerAaveBoostedStablePool(uint shareAmount) external returns(uint[] memory) {
        uint bptAmountOut = shareAmount * ISmartVault(BB_AM_USD_VAULT).underlyingBalanceWithInvestment() / IERC20(BB_AM_USD_VAULT).totalSupply();
        (, uint[] memory tokensBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(BB_AM_USD_POOL_ID);
        uint totalTokenBalances = tokensBalances[0] + tokensBalances[2] + tokensBalances[3];

        uint[] memory outAmounts = new uint[](3);
        uint bptOutTmp;

        bptOutTmp = _queryBalancerSingleSwap(BB_AM_USD_POOL_ID, 1, 0, bptAmountOut * tokensBalances[0] / totalTokenBalances);
        outAmounts[0] = _queryBalancerSingleSwap(BB_AM_USD_POOL0_ID, 0, 1, bptOutTmp);
        bptOutTmp = _queryBalancerSingleSwap(BB_AM_USD_POOL_ID, 1, 2, bptAmountOut * tokensBalances[2] / totalTokenBalances);
        outAmounts[1] = _queryBalancerSingleSwap(BB_AM_USD_POOL2_ID, 2, 1, bptOutTmp);
        bptOutTmp = _queryBalancerSingleSwap(BB_AM_USD_POOL_ID, 1, 3, bptAmountOut * tokensBalances[3] / totalTokenBalances);
        outAmounts[2] = _queryBalancerSingleSwap(BB_AM_USD_POOL3_ID, 2, 1, bptOutTmp);

        return outAmounts;
    }

    function quoteIntoBalancerTetuBal(uint wethAmount, uint balAmount) external returns(uint) {
        uint[] memory amounts = new uint[](2);
        amounts[0] = wethAmount;
        amounts[1] = balAmount;

        address[] memory assets = new address[](2);
        assets[0] = WETH;
        assets[1] = BAL;

        uint bptOut = _quoteJoinBalancer(WETH20BAL80_POOL_ID, assets, amounts);
        (, uint[] memory tetuBalWethBalPoolBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(TETUBAL_WETHBAL_POOL_ID);
        uint canBuyTetuBalBPTByGoodPrice = tetuBalWethBalPoolBalances[1] > tetuBalWethBalPoolBalances[0] ? (tetuBalWethBalPoolBalances[1] - tetuBalWethBalPoolBalances[0]) / 2 : 0;
        uint needToMintTetuBal;
        if (canBuyTetuBalBPTByGoodPrice < bptOut) {
            needToMintTetuBal = bptOut - canBuyTetuBalBPTByGoodPrice;
        }

        uint swapOut = _queryBalancerSingleSwap(TETUBAL_WETHBAL_POOL_ID, 0, 1, bptOut - needToMintTetuBal);

        return swapOut + needToMintTetuBal;
    }

    function quoteOutBalancerTetuBal(uint amount) external returns(uint[] memory) {
        uint wethBalBpt = _queryBalancerSingleSwap(TETUBAL_WETHBAL_POOL_ID, 1, 0, amount);
        address[] memory assets = new address[](2);
        assets[0] = WETH;
        assets[1] = BAL;
        uint[] memory amounts = new uint[](2);
        (, uint[] memory amountsOut) = IBalancerHelper(BALANCER_HELPER).queryExit(
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
        (, uint[] memory tetuQiQiPoolBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(TETUQI_QI_POOL_ID);
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
        uint bptOut = _quoteJoinBalancerPhantom(TETUQI_QI_POOL_ID, assets, amounts, TETUQI_QI_BPT);
        return bptOut * IERC20(TETUQI_QI_VAULT).totalSupply() / ISmartVault(TETUQI_QI_VAULT).underlyingBalanceWithInvestment();
    }

    function quoteOutBalancerTetuQiQi(uint shareAmount) external returns(uint) {
        uint bptOut = shareAmount * ISmartVault(TETUQI_QI_VAULT).underlyingBalanceWithInvestment() / IERC20(TETUQI_QI_VAULT).totalSupply();
        address[] memory assets = new address[](3);
        assets[0] = TETUQI_QI_BPT;
        assets[1] = TETUQI;
        assets[2] = QI;
        uint[] memory amounts = new uint[](3);
        (, uint[] memory amountsOut) = IBalancerHelper(BALANCER_HELPER).queryExit(
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

    // ******************** DATA EXTRACTION HELPERS *********************

    function getBalancerPoolTokens(address bpt) external view returns(
        IERC20[] memory,
        uint[] memory
    ) {
        bytes32 poolId = IBPT(bpt).getPoolId();
        (IERC20[] memory tokens, uint[] memory balances,) = IBVault(BALANCER_VAULT).getPoolTokens(poolId);
        return (tokens, balances);
    }

    // ************************* INTERNAL *******************

    function _queryBalancerSingleSwap(bytes32 poolId, uint assetInIndex, uint assetOutIndex, uint amountIn) internal returns (uint) {
        (IERC20[] memory tokens,,) = IBVault(BALANCER_VAULT).getPoolTokens(poolId);
        IAsset[] memory assets = new IAsset[](tokens.length);
        for (uint i; i < tokens.length; i++) {
            assets[i] = IAsset(address(tokens[i]));
        }

        IBVault.BatchSwapStep[] memory swaps = new IBVault.BatchSwapStep[](1);

        IBVault.FundManagement memory fundManagementStruct = IBVault.FundManagement({
            sender : address(this),
            fromInternalBalance : false,
            recipient : payable(address(this)),
            toInternalBalance : false
        });

        swaps[0] = IBVault.BatchSwapStep(
            poolId,
            assetInIndex,
            assetOutIndex,
            amountIn,
            ""
        );

        int256[] memory assetDeltas = IBVault(BALANCER_VAULT).queryBatchSwap(
            IBVault.SwapKind.GIVEN_IN,
            swaps,
            assets,
            fundManagementStruct
        );

        return uint(-assetDeltas[assetOutIndex]);
    }

    /// @dev Swap _tokenIn to _tokenOut using pool identified by _poolId
    function _balancerSwap(bytes32 poolId, address tokenIn, address tokenOut, uint amountIn) internal {
        if (amountIn != 0) {
            IBVault.SingleSwap memory singleSwapData = IBVault.SingleSwap({
                poolId : poolId,
                kind : IBVault.SwapKind.GIVEN_IN,
                assetIn : IAsset(tokenIn),
                assetOut : IAsset(tokenOut),
                amount : amountIn,
                userData : ""
            });

            IBVault.FundManagement memory fundManagementStruct = IBVault.FundManagement({
                sender : address(this),
                fromInternalBalance : false,
                recipient : payable(address(this)),
                toInternalBalance : false
            });

            _approveIfNeeds(tokenIn, amountIn, BALANCER_VAULT);
            IBVault(BALANCER_VAULT).swap(singleSwapData, fundManagementStruct, 1, block.timestamp);
        }
    }

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

    function _quoteJoinBalancerPhantom(bytes32 poolId, address[] memory assets, uint[] memory amounts, address bpt) internal returns(uint) {
        uint userDataAmountsLen;
        uint i;
        for (; i < assets.length; i++) {
            if (assets[i] != bpt) {
                userDataAmountsLen++;
            }
        }

        uint[] memory userDataAmounts = new uint[](userDataAmountsLen);
        uint k;
        for (i = 0; i < assets.length; i++) {
            if (assets[i] != bpt) {
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

    function _addLiquidityBalancer(bytes32 poolId, address[] memory assets, uint[] memory amounts, address bpt) internal {
        uint len = assets.length;
        IAsset[] memory _poolTokens = new IAsset[](len);
        uint userDataAmountsLen;
        uint i;
        for (; i < len; i++) {
            if (assets[i] != bpt) {
                if (amounts[i] != 0) {
                    _approveIfNeeds(assets[i], amounts[i], BALANCER_VAULT);
                }
                userDataAmountsLen++;
            }
            _poolTokens[i] = IAsset(assets[i]);
        }

        uint[] memory userDataAmounts = new uint[](userDataAmountsLen);
        uint k;
        for (i = 0; i < len; i++) {
            if (assets[i] != bpt) {
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
                /// BPT_IN_FOR_EXACT_TOKENS_OUT for stable pools or EXACT_BPT_IN_FOR_TOKENS_OUT for weighted pools
                userData : amounts[0] != 0 ? abi.encode(1, amounts, bptAmount) : abi.encode(1, bptAmount),
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

    function _sendBackChange(address[] memory assets) internal {
        uint len = assets.length;
        for (uint i; i < len; i++) {
            uint bal = IERC20(assets[i]).balanceOf(address(this));
            if (bal != 0) {
                IERC20(assets[i]).safeTransfer(msg.sender, bal);
            }
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