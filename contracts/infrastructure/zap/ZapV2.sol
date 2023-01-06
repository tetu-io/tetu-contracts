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
import "../../third_party/balancer/IBalancerHelper.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";


contract ZapV2 is Controllable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant VERSION = "1.0.0";
    address public constant ONEINCH_ROUTER = 0x1111111254fb6c44bAC0beD2854e76F90643097d;

    mapping(address => uint) calls;

    constructor(address _controller) {
        Controllable.initializeControllable(_controller);
    }

    modifier onlyOneCallPerBlock() {
        require(calls[msg.sender] < block.number, "ZC: call in the same block forbidden");
        _;
        calls[msg.sender] = block.number;
    }

    // ******************** USERS ZAP ACTIONS *********************

    function zapIntoSingle(
        address _vault,
        address _tokenIn,
        bytes memory _assetSwapData,
        uint _tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(_tokenInAmount > 1, "ZC: not enough amount");

        IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _tokenInAmount);

        address asset = ISmartVault(_vault).underlying();

        if (_tokenIn != asset) {
            _callOneInchSwap(
                _tokenIn,
                _tokenInAmount,
                _assetSwapData
            );
        }

        uint assetAmount = IERC20(asset).balanceOf(address(this));

        _depositToVault(_vault, asset, assetAmount);
    }

    function zapOutSingle(
        address _vault,
        address _tokenOut,
        bytes memory _assetSwapData,
        uint _shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(_shareAmount != 0, "ZC: zero amount");

        IERC20(_vault).safeTransferFrom(msg.sender, address(this), _shareAmount);

        address asset = ISmartVault(_vault).underlying();

        uint assetBalance = _withdrawFromVault(_vault, asset, _shareAmount);

        if (_tokenOut != asset) {
            _callOneInchSwap(
                asset,
                assetBalance,
                _assetSwapData
            );
        }

        uint tokenOutBalance = IERC20(_tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(_tokenOut).safeTransfer(msg.sender, tokenOutBalance);
    }

    function zapIntoUniswapV2(
        address _vault,
        address _tokenIn,
        bytes memory _asset0SwapData,
        bytes memory _asset1SwapData,
        uint _tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(_tokenInAmount > 1, "ZC: not enough amount");

        IUniswapV2Pair lp = IUniswapV2Pair(ISmartVault(_vault).underlying());

        IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _tokenInAmount / 2 * 2);

        address asset0 = lp.token0();
        address asset1 = lp.token1();

        if (_tokenIn != asset0) {
            _callOneInchSwap(
                _tokenIn,
                _tokenInAmount / 2,
                _asset0SwapData
            );
        }

        if (_tokenIn != asset1) {
            _callOneInchSwap(
                _tokenIn,
                _tokenInAmount / 2,
                _asset1SwapData
            );
        }

        uint lpAmount = _addLiquidityUniswapV2(address(lp), asset0, asset1);

        _depositToVault(_vault, address(lp), lpAmount);

        _sendBackChange(asset0, asset1);
    }

    function zapOutUniswapV2(
        address _vault,
        address _tokenOut,
        bytes memory _asset0SwapData,
        bytes memory _asset1SwapData,
        uint _shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(_shareAmount != 0, "ZC: zero amount");

        IERC20(_vault).safeTransferFrom(msg.sender, address(this), _shareAmount);

        address lp = ISmartVault(_vault).underlying();

        uint lpBalance = _withdrawFromVault(_vault, lp, _shareAmount);

        IERC20(lp).safeTransfer(lp, lpBalance);

        (uint amount0, uint amount1) = IUniswapV2Pair(lp).burn(address(this));
        address asset0 = IUniswapV2Pair(lp).token0();
        address asset1 = IUniswapV2Pair(lp).token1();

        if (_tokenOut != asset0) {
            _callOneInchSwap(
                asset0,
                amount0,
                _asset0SwapData
            );
        }

        if (_tokenOut != asset1) {
            _callOneInchSwap(
                asset1,
                amount1,
                _asset1SwapData
            );
        }

        uint tokenOutBalance = IERC20(_tokenOut).balanceOf(address(this));
        require(tokenOutBalance != 0, "zero token out balance");
        IERC20(_tokenOut).safeTransfer(msg.sender, tokenOutBalance);

        _sendBackChange(asset0, asset1);
    }

    // ******************** QUOTE HELPERS *********************

    function quoteIntoSingle(address _vault, uint _amount) external view returns(uint) {
        return _amount * IERC20(_vault).totalSupply() / ISmartVault(_vault).underlyingBalanceWithInvestment();
    }

    function quoteOutSingle(address _vault, uint _shareAmount) external view returns(uint) {
        return _shareAmount * ISmartVault(_vault).underlyingBalanceWithInvestment() / IERC20(_vault).totalSupply();
    }

    function quoteIntoUniswapV2(address _vault, uint _amount0, uint _amount1) external view returns(uint) {
        address lp = ISmartVault(_vault).underlying();
        uint totalSupply = IERC20(lp).totalSupply();
        uint amountA;
        uint amountB;
        uint liquidity;
        (uint reserve0, uint reserve1,) = IUniswapV2Pair(lp).getReserves();
        uint amount1Optimal = _quoteLiquidityUniswapV2(_amount0, reserve0, reserve1);
        if (amount1Optimal <= _amount1) {
            (amountA, amountB) = (_amount0, amount1Optimal);
            liquidity = Math.min(amountA * totalSupply / reserve0, amountB * totalSupply / reserve1);
        } else {
            uint amount0Optimal = _quoteLiquidityUniswapV2(_amount1, reserve1, reserve0);
            (amountA, amountB) = (amount0Optimal, _amount1);
            liquidity = Math.min(amountA * totalSupply / reserve0, amountB * totalSupply / reserve1);
        }
        return liquidity * IERC20(_vault).totalSupply() / ISmartVault(_vault).underlyingBalanceWithInvestment();
    }

    function quoteOutUniswapV2(address _vault, uint _shareAmount) external view returns(uint[] memory) {
        uint liquidityOut = _shareAmount * ISmartVault(_vault).underlyingBalanceWithInvestment() / IERC20(_vault).totalSupply();
        address lp = ISmartVault(_vault).underlying();
        uint totalSupply = IERC20(lp).totalSupply();
        (uint reserve0, uint reserve1,) = IUniswapV2Pair(lp).getReserves();
        uint[] memory amountsOut = new uint[](2);
        // -1 need for working zapOutUniswapV2 with tetuswap
        amountsOut[0] = liquidityOut * reserve0 / totalSupply - 1;
        amountsOut[1] = liquidityOut * reserve1 / totalSupply - 1;
        return amountsOut;
    }

    // ************************* INTERNAL *******************

    function _addLiquidityUniswapV2(address _lp, address _asset0, address _asset1) internal returns (uint) {
        uint amount0 = IERC20(_asset0).balanceOf(address(this));
        uint amount1 = IERC20(_asset1).balanceOf(address(this));
        uint amountA;
        uint amountB;

        (uint reserve0, uint reserve1,) = IUniswapV2Pair(_lp).getReserves();
        uint amount1Optimal = _quoteLiquidityUniswapV2(amount0, reserve0, reserve1);
        if (amount1Optimal <= amount1) {
            (amountA, amountB) = (amount0, amount1Optimal);
        } else {
            uint amount0Optimal = _quoteLiquidityUniswapV2(amount1, reserve1, reserve0);
            (amountA, amountB) = (amount0Optimal, amount1);
        }

        IERC20(_asset0).safeTransfer(_lp, amountA);
        IERC20(_asset1).safeTransfer(_lp, amountB);
        return IUniswapV2Pair(_lp).mint(address(this));
    }

    /// @dev Given some amount of an asset and pair reserves, returns an equivalent amount of the other asset.
    function _quoteLiquidityUniswapV2(uint amountA, uint reserveA, uint reserveB) internal pure returns (uint amountB) {
        require(amountA > 0, 'ZC: INSUFFICIENT_AMOUNT');
        require(reserveA > 0 && reserveB > 0, 'ZC: INSUFFICIENT_LIQUIDITY');
        amountB = amountA * reserveB / reserveA;
    }

    function _sendBackChange(address _asset0, address _asset1) internal {
        uint bal0 = IERC20(_asset0).balanceOf(address(this));
        uint bal1 = IERC20(_asset1).balanceOf(address(this));

        if (bal0 != 0) {
            IERC20(_asset0).safeTransfer(msg.sender, bal0);
        }

        if (bal1 != 0) {
            IERC20(_asset1).safeTransfer(msg.sender, bal1);
        }
    }

    function _callOneInchSwap(
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
    function _depositToVault(address _vault, address _asset, uint _amount) internal {
        _approveIfNeeds(_asset, _amount, _vault);
        ISmartVault(_vault).depositAndInvest(_amount);
        uint shareBalance = IERC20(_vault).balanceOf(address(this));
        require(shareBalance != 0, "ZC: zero shareBalance");
        IERC20(_vault).safeTransfer(msg.sender, shareBalance);
    }

    /// @dev Withdraw from vault and check the result
    function _withdrawFromVault(address _vault, address _asset, uint _amount) internal returns (uint) {
        ISmartVault(_vault).withdraw(_amount);
        uint underlyingBalance = IERC20(_asset).balanceOf(address(this));
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