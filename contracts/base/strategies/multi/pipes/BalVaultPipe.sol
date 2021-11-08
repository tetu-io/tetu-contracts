// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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

    string constant _WRONG_SOURCE_TOKEN = "BVP: Wrong source token";

    BalVaultPipeData public d;

    constructor(BalVaultPipeData memory _d) Pipe() {
        d = _d;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) override onlyOwner public returns (uint256 output) {
        uint256 before = ERC20Balance(d.lpToken);

        IERC20(d.sourceToken).safeApprove(d.vault, 0);
        IERC20(d.sourceToken).safeApprove(d.vault, amount);

        //  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)
        (IERC20[] memory tokens,,) = IBVault(d.vault).getPoolTokens(d.poolID);
        require(d.sourceToken == address(tokens[d.tokenIndex]), _WRONG_SOURCE_TOKEN);
        uint256[] memory maxAmountsIn = new uint256[](4);
        maxAmountsIn[d.tokenIndex] = amount;

        // example found at https://etherscan.io/address/0x5C6361f4cC18Df63D07Abd1D59A282d82C27Ad17#code#F2#L162
        uint256 minAmountOut = 1;
        bytes memory userData = abi.encode(IBVault.JoinKind.TOKEN_IN_FOR_EXACT_BPT_OUT, maxAmountsIn, minAmountOut); //TODO check

        IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
            assets: asIAsset(tokens),
            maxAmountsIn: maxAmountsIn,
            userData: userData,
            fromInternalBalance: false
        });

        IBVault(d.vault).joinPool(d.poolID, address(this), address(this), request);

        uint256 current = ERC20Balance(d.lpToken);
        output = current - before;

        transferERC20toNextPipe(d.lpToken, output); //TODO or all current balance?

    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) override onlyOwner public returns (uint256 output) {
        uint256 before = ERC20Balance(d.sourceToken);

        IERC20(d.lpToken).safeApprove(d.vault, 0);
        IERC20(d.lpToken).safeApprove(d.vault, amount);

        uint256 minAmountOut = 1;

        (IERC20[] memory tokens,,) = IBVault(d.vault).getPoolTokens(d.poolID);
        require(d.sourceToken == address(tokens[d.tokenIndex]), _WRONG_SOURCE_TOKEN);
        uint256[] memory minAmountsOut = new uint256[](4);
        minAmountsOut[d.tokenIndex] = minAmountOut;

        bytes memory userData = abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, amount, minAmountOut); //TODO check

        IBVault.ExitPoolRequest memory request = IBVault.ExitPoolRequest({
            assets: asIAsset(tokens),
            minAmountsOut: minAmountsOut,
            userData: userData,
            toInternalBalance: false
        });

        IBVault(d.vault).exitPool(d.poolID, address(this), payable(address(this)), request);

        uint256 current = ERC20Balance(d.sourceToken);
        output = current - before;

        transferERC20toPrevPipe(d.sourceToken, output); //TODO or all current balance?
    }

    function asIAsset(IERC20[] memory tokens) private pure returns (IAsset[] memory assets) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            assets := tokens
        }
    }

    /// @dev available ETH (MATIC) source balance
    /// @return balance in source units
    function sourceBalance() override public view returns (uint256) {
        return ERC20Balance(d.sourceToken);
    }

    /// @dev underlying balance (LP token)
    /// @return balance in underlying units
    function underlyingBalance() override public view returns (uint256) {
        return ERC20Balance(d.lpToken);
    }

}
