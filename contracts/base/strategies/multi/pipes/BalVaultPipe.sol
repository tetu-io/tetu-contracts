// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./Pipe.sol";
import "./../../../../third_party/balancer/IBVault.sol";
import "./../../../../third_party/balancer/IMockStableMath.sol";
import "./../../../../third_party/balancer/IStablePool.sol";
import "./../../../../third_party/balancer/IBasePool.sol";


struct BalVaultPipeData {
    address sourceToken;
    address vault;
    bytes32 poolID;
    uint256 tokenIndex;
    address lpToken;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract BalVaultPipe is Pipe {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    string constant _WRONG_SOURCE_TOKEN = "BVP: Wrong source token";

    /// @dev creates context
    function create(BalVaultPipeData memory d) public pure returns (bytes memory) {
        return abi.encode(d.sourceToken, d.vault, d.poolID, d.tokenIndex, d.lpToken);
    }

    /// @dev decodes context
    function context(bytes memory c) internal pure
    returns (address sourceToken, address vault, bytes32 poolID, uint256 tokenIndex, address lpToken) {
        (sourceToken, vault, poolID, tokenIndex, lpToken) = abi.decode(c,
            (address, address, bytes32, uint256, address)
        );
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param c abi-encoded context
    /// @param amount in source units
    /// @return output in underlying units
    function _put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address sourceToken, address vault, bytes32 poolID, uint256 tokenIndex, address lpToken) = context(c);
        uint256 before = IERC20(lpToken).balanceOf(address(this));

        IERC20(sourceToken).safeApprove(vault, 0);
        IERC20(sourceToken).safeApprove(vault, amount);

        //  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)
        (IERC20[] memory tokens,,) = IBVault(vault).getPoolTokens(poolID);
        require( sourceToken ==address(tokens[ tokenIndex]), _WRONG_SOURCE_TOKEN);
        uint256[] memory maxAmountsIn = new uint256[](4);
        maxAmountsIn[tokenIndex] = amount;

        // example found at https://etherscan.io/address/0x5C6361f4cC18Df63D07Abd1D59A282d82C27Ad17#code#F2#L162
        uint256 minAmountOut = 1;
        bytes memory userData = abi.encode(IBVault.JoinKind.TOKEN_IN_FOR_EXACT_BPT_OUT, maxAmountsIn, minAmountOut); //TODO check

        IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
            assets: _asIAsset(tokens),
            maxAmountsIn: maxAmountsIn,
            userData: userData,
            fromInternalBalance: false
        });

        IBVault(vault).joinPool(poolID, address(this), address(this), request);

        uint256 current = IERC20(lpToken).balanceOf(address(this));
        output = current.sub(before);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param c abi-encoded context
    /// @param amount in underlying units
    /// @return output in source units
    function _get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address sourceToken, address vault, bytes32 poolID, uint256 tokenIndex, address lpToken) = context(c);
        uint256 before = IERC20(sourceToken).balanceOf(address(this));

        IERC20(lpToken).safeApprove(vault, 0);
        IERC20(lpToken).safeApprove(vault, amount);

        //  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)
        (IERC20[] memory tokens,,) = IBVault(vault).getPoolTokens(poolID);
        require( sourceToken==address(tokens[tokenIndex]), _WRONG_SOURCE_TOKEN);
        uint256[] memory maxAmountsIn = new uint256[](4);
        maxAmountsIn[tokenIndex] = amount;

        // example found at https://etherscan.io/address/0x5C6361f4cC18Df63D07Abd1D59A282d82C27Ad17#code#F2#L162
        uint256 minAmountOut = 1;
        bytes memory userData = abi.encode(IBVault.JoinKind.TOKEN_IN_FOR_EXACT_BPT_OUT, maxAmountsIn, minAmountOut); //TODO check

        IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
            assets: _asIAsset(tokens),
            maxAmountsIn: maxAmountsIn,
            userData: userData,
            fromInternalBalance: false
        });

        IBVault(vault).joinPool(poolID, address(this), address(this), request);

        uint256 current = IERC20(sourceToken).balanceOf(address(this));
        output = current.sub(before);
    }

    function _asIAsset(IERC20[] memory tokens) public pure returns (IAsset[] memory assets) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            assets := tokens
        }
    }

    /// @dev available ETH (MATIC) source balance
    /// @param c abi-encoded context
    /// @return balance in source units
    function _sourceBalance(bytes memory c) override public view returns (uint256) {
        (address sourceToken,,,,) = context(c);
        return IERC20(sourceToken).balanceOf(address(this));
    }

    /// @dev underlying balance (LP token)
    /// @param c abi-encoded context
    /// @return balance in underlying units
    function _underlyingBalance(bytes memory c) override public view returns (uint256) {
        (,,,, address lpToken) = context(c);
        return IERC20(lpToken).balanceOf(address(this));
    }

}
