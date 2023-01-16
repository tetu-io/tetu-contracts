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
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../../base/governance/Controllable.sol";
import "../../base/interface/ISmartVault.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../third_party/balancer/IBPT.sol";
import "./ZapV2Libraries.sol";

/// @title The second generation of dedicated solution for interacting with Tetu vaults.
///        Able to zap in/out assets to vaults.
/// @author a17
contract ZapV2 is Controllable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";
    address internal constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

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
            ZapV2CommonLibrary._callOneInchSwap(
                tokenIn,
                tokenInAmount,
                assetSwapData
            );
        }

        uint assetAmount = IERC20(asset).balanceOf(address(this));

        ZapV2CommonLibrary._depositToVault(vault, asset, assetAmount);
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

        uint assetBalance = ZapV2CommonLibrary._withdrawFromVault(vault, asset, shareAmount);

        if (tokenOut != asset) {
            ZapV2CommonLibrary._callOneInchSwap(
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
        ZapV2CommonLibrary._sendBackChange(dustAssets);
    }

    function zapIntoUniswapV2(
        address vault,
        address tokenIn,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2UniswapLibrary.zapIntoUniswapV2(vault, tokenIn, asset0SwapData, asset1SwapData, tokenInAmount);
    }

    function zapOutUniswapV2(
        address vault,
        address tokenOut,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2UniswapLibrary.zapOutUniswapV2(vault, tokenOut, asset0SwapData, asset1SwapData, shareAmount);
    }

    function zapIntoBalancer(
        address vault,
        address tokenIn,
        address[] memory assets,
        bytes[] memory assetsSwapData,
        uint[] memory tokenInAmounts
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2Balancer1Library.zapIntoBalancer(vault, tokenIn, assets, assetsSwapData, tokenInAmounts);
    }

    function zapOutBalancer(
        address vault,
        address tokenOut,
        address[] memory assets,
        uint[] memory amounts,
        bytes[] memory assetsSwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2Balancer1Library.zapOutBalancer(vault, tokenOut, assets, amounts, assetsSwapData, shareAmount);
    }

    function zapIntoBalancerAaveBoostedStablePool(
        address tokenIn,
        bytes[] memory assetsSwapData,
        uint[] memory tokenInAmounts // calculated off-chain
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2Balancer1Library.zapIntoBalancerAaveBoostedStablePool(tokenIn, assetsSwapData, tokenInAmounts);
    }

    function zapOutBalancerAaveBoostedStablePool(
        address tokenOut,
        bytes[] memory assetsSwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2Balancer1Library.zapOutBalancerAaveBoostedStablePool(tokenOut, assetsSwapData, shareAmount);
    }

    function zapIntoBalancerTetuBal(
        address tokenIn,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2Balancer2Library.zapIntoBalancerTetuBal(tokenIn, asset0SwapData, asset1SwapData, tokenInAmount);
    }

    function zapOutBalancerTetuBal(
        address tokenOut,
        bytes memory asset0SwapData,
        bytes memory asset1SwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2Balancer2Library.zapOutBalancerTetuBal(tokenOut, asset0SwapData, asset1SwapData, shareAmount);
    }

    function zapIntoBalancerTetuQiQi(
        address tokenIn,
        bytes memory assetSwapData,
        uint tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2Balancer2Library.zapIntoBalancerTetuQiQi(tokenIn, assetSwapData, tokenInAmount);
    }

    function zapOutBalancerTetuQiQi(
        address tokenOut,
        bytes memory assetSwapData,
        uint shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        ZapV2Balancer2Library.zapOutBalancerTetuQiQi(tokenOut, assetSwapData, shareAmount);
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
        return ZapV2UniswapLibrary.quoteIntoUniswapV2(vault, amount0, amount1);
    }

    function quoteOutUniswapV2(address vault, uint shareAmount) external view returns(uint[] memory) {
        return ZapV2UniswapLibrary.quoteOutUniswapV2(vault, shareAmount);
    }

    function quoteIntoBalancer(address vault, address[] memory assets, uint[] memory amounts) external returns(uint) {
        return ZapV2Balancer1Library.quoteIntoBalancer(vault, assets, amounts);
    }

    /// @dev Quote out for ComposableStablePool with Phantom BPT.
    ///      This unusual algorithm is used due to the impossibility of using EXACT_BPT_IN_FOR_ALL_TOKENS_OUT.
    ///      We think it's can be better than queryBatchSwap for such pools.
    function quoteOutBalancer(address vault, address[] memory assets, uint shareAmount) external view returns(uint[] memory) {
        return ZapV2Balancer1Library.quoteOutBalancer(vault, assets, shareAmount);
    }

    function quoteIntoBalancerAaveBoostedStablePool(uint[] memory amounts) external returns(uint) {
        return ZapV2Balancer1Library.quoteIntoBalancerAaveBoostedStablePool(amounts);
    }

    function quoteOutBalancerAaveBoostedStablePool(uint shareAmount) external returns(uint[] memory) {
        return ZapV2Balancer1Library.quoteOutBalancerAaveBoostedStablePool(shareAmount);
    }

    function quoteIntoBalancerTetuBal(uint wethAmount, uint balAmount) external returns(uint) {
        return ZapV2Balancer2Library.quoteIntoBalancerTetuBal(wethAmount, balAmount);
    }

    function quoteOutBalancerTetuBal(uint amount) external returns(uint[] memory) {
        return ZapV2Balancer2Library.quoteOutBalancerTetuBal(amount);
    }

    function quoteIntoBalancerTetuQiQi(uint qiAmount) external returns(uint) {
        return ZapV2Balancer2Library.quoteIntoBalancerTetuQiQi(qiAmount);
    }

    function quoteOutBalancerTetuQiQi(uint shareAmount) external returns(uint) {
        return ZapV2Balancer2Library.quoteOutBalancerTetuQiQi(shareAmount);
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

    // ************************* GOV ACTIONS *******************

    /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
    /// @param token Token address
    /// @param amount Token amount
    function salvage(address token, uint amount) external onlyControllerOrGovernance {
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}