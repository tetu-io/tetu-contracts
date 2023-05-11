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

library ZapV2CommonLibrary {
    using SafeERC20 for IERC20;
    address private constant ONEINCH_ROUTER = 0x1111111254fb6c44bAC0beD2854e76F90643097d;

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
}
