// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Pipe.sol";
import "../../../../third_party/uniswap/IWETH.sol";

/// @title Unwrapping Pipe Contract
/// @author bogdoslav
contract UnwrappingPipe is Pipe {
    /// @dev creates context
    function create(address WETH) public pure returns (bytes memory){
        return abi.encode(WETH);
    }

    /// @dev decodes context
    function context(bytes memory c) internal pure returns (address WETH) {
      (WETH) = abi.decode(c, (address));
    }

    /// @dev function for investing, deposits, entering, borrowing
    function _put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address WETH) = context(c);
        IWETH(WETH).deposit{value:amount}();
        output = amount;
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    function _get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address WETH) = context(c);
        IWETH(WETH).withdraw(amount);
        output = amount;
    }

    /// @dev available source balance (WETH, WMATIC etc)
    /// @param c abi-encoded context
    /// @return balance in source units
    function _sourceBalance(bytes memory c) override public view returns (uint256) {
        (address  WETH) = context(c);
        return IERC20(WETH).balanceOf(address(this));
    }

    /// @dev underlying balance (ETH, MATIC)
    /// param c abi-encoded context
    /// @return balance in underlying units
    function _underlyingBalance(bytes memory) override public view returns (uint256) {
        return address(this).balance;
    }

    /// @dev to receive Ether (Matic)
    receive() external payable {}

}
