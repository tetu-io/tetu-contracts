// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./Pipe.sol";
import "./../../../../third_party/qudao-mai/ICamWMATIC.sol";


struct MaiCamWMaticPipeData {
    address sourceToken;
    address lpToken;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract MaiCamWMaticPipe is Pipe {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// @dev creates context
    function create(MaiCamWMaticPipeData memory d) public pure returns (bytes memory){
        return abi.encode(d.sourceToken, d.lpToken);
    }

    /// @dev decodes context
    function context(bytes memory c) internal pure returns (address sourceToken, address lpToken) {
        (sourceToken, lpToken) = abi.decode(c, (address, address));
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param c abi-encoded context
    /// @param amount in source units
    /// @return output in underlying units
    function _put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address sourceToken, address lpToken) = context(c);
        uint256 before = IERC20(lpToken).balanceOf(address(this));

        IERC20(sourceToken).safeApprove(lpToken, 0);
        IERC20(sourceToken).safeApprove(lpToken, amount);
        ICamWMATIC(lpToken).enter(amount);

        uint256 current = IERC20(lpToken).balanceOf(address(this));
        output = current.sub(before);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param c abi-encoded context
    /// @param amount in underlying units
    /// @return output in source units
    function _get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address sourceToken, address lpToken) = context(c);
        uint256 before = IERC20(sourceToken).balanceOf(address(this));

        ICamWMATIC(lpToken).leave(amount);

        uint256 current = IERC20(sourceToken).balanceOf(address(this));
        output = current.sub(before);
    }

    /// @dev available ETH (MATIC) source balance
    /// @param c abi-encoded context
    /// @return balance in source units
    function _sourceBalance(bytes memory c) override public view returns (uint256) {
        (address sourceToken,)  = context(c);
        return IERC20(sourceToken).balanceOf(address(this));
    }

    /// @dev underlying balance (LP token)
    /// @param c abi-encoded context
    /// @return balance in underlying units
    function _underlyingBalance(bytes memory c) override public view returns (uint256) {
        (, address lpToken)  = context(c);
        return IERC20(lpToken).balanceOf(address(this));
    }

}
