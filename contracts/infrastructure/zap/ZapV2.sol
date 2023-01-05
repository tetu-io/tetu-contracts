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
        uint256 _tokenInAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(_tokenInAmount > 1, "ZC: not enough amount");

        IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _tokenInAmount);

        address asset = ISmartVault(_vault).underlying();

        if (_tokenIn != asset) {
            callOneInchSwap(
                _tokenIn,
                _tokenInAmount,
                _assetSwapData
            );
        }

        uint assetAmount = IERC20(asset).balanceOf(address(this));

        depositToVault(_vault, asset, assetAmount);
    }

    function zapOutSingle(
        address _vault,
        address _tokenOut,
        bytes memory _assetSwapData,
        uint256 _shareAmount
    ) external nonReentrant onlyOneCallPerBlock {
        require(_shareAmount != 0, "ZC: zero amount");

        IERC20(_vault).safeTransferFrom(msg.sender, address(this), _shareAmount);

        address asset = ISmartVault(_vault).underlying();

        uint256 assetBalance = withdrawFromVault(_vault, asset, _shareAmount);

        if (_tokenOut != asset) {
            callOneInchSwap(
                asset,
                assetBalance,
                _assetSwapData
            );
        }

        uint256 tokenInBalance = IERC20(_tokenOut).balanceOf(address(this));
        require(tokenInBalance != 0, "zero token out balance");
        IERC20(_tokenOut).safeTransfer(msg.sender, tokenInBalance);
    }

    // ******************** QUOTE HELPERS *********************

    function quoteIntoSingle(address _vault, uint _amount) external view returns(uint) {
        return _amount * IERC20(_vault).totalSupply() / ISmartVault(_vault).underlyingBalanceWithInvestment();
    }

    function quoteOutSingle(address _vault, uint _shareAmount) external view returns(uint) {
        return _shareAmount * ISmartVault(_vault).underlyingBalanceWithInvestment() / IERC20(_vault).totalSupply();
    }

    // ************************* INTERNAL *******************

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
    function depositToVault(address _vault, address _asset, uint _amount) internal {
        _approveIfNeeds(_asset, _amount, _vault);
        ISmartVault(_vault).depositAndInvest(_amount);
        uint shareBalance = IERC20(_vault).balanceOf(address(this));
        require(shareBalance != 0, "ZC: zero shareBalance");
        IERC20(_vault).safeTransfer(msg.sender, shareBalance);
    }

    /// @dev Withdraw from vault and check the result
    function withdrawFromVault(address _vault, address _asset, uint _amount) internal returns (uint) {
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