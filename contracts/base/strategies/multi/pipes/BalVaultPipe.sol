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

import "hardhat/console.sol";

struct BalVaultPipeData {
    address sourceToken;
    address vault;
    bytes32 poolID;
    uint256 tokenIndex;
    address lpToken;
    address rewardToken;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract BalVaultPipe is Pipe {
    using SafeERC20 for IERC20;

    BalVaultPipeData public d;

    constructor(BalVaultPipeData memory _d) Pipe() {
        name = 'BalVaultPipe';
        d = _d;
        sourceToken = _d.sourceToken;
        outputToken = _d.lpToken;
        rewardToken = _d.rewardToken;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('BalVaultPipe put amount', amount);
        uint256 before = ERC20Balance(d.lpToken);

        //  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)
        (IERC20[] memory tokens,,) = IBVault(d.vault).getPoolTokens(d.poolID);
        require(d.sourceToken == address(tokens[d.tokenIndex]), "BVP: Wrong source token");
        uint256[] memory maxAmountsIn = new uint256[](4);
        maxAmountsIn[d.tokenIndex] = amount;

        // example found at https://etherscan.io/address/0x5C6361f4cC18Df63D07Abd1D59A282d82C27Ad17#code#F2#L162
        uint256 minAmountOut = 1;
        bytes memory userData = abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, maxAmountsIn, minAmountOut);

        IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
            assets: asIAsset(tokens),
            maxAmountsIn: maxAmountsIn,
            userData: userData,
            fromInternalBalance: false
        });

        ERC20Approve(sourceToken, d.vault, amount);
        IBVault(d.vault).joinPool(d.poolID, address(this), address(this), request);

        uint256 current = ERC20Balance(outputToken);
        output = current - before;

        transferERC20toNextPipe(outputToken, current);

    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('BalVaultPipe get amount', amount);
        uint256 before = ERC20Balance(sourceToken);
        console.log('before', before);

        ERC20Approve(outputToken, d.vault, amount);

        (IERC20[] memory tokens,,) = IBVault(d.vault).getPoolTokens(d.poolID);
        require(sourceToken == address(tokens[d.tokenIndex]), "BVP: Wrong source token");
        uint256[] memory minAmountsOut = new uint256[](4);
        uint256 minAmountOut = 1;
        minAmountsOut[d.tokenIndex] = minAmountOut;

        bytes memory userData = abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, amount, d.tokenIndex);

        IBVault.ExitPoolRequest memory request = IBVault.ExitPoolRequest({
            assets: asIAsset(tokens),
            minAmountsOut: minAmountsOut,
            userData: userData,
            toInternalBalance: false
        });

        IBVault(d.vault).exitPool(d.poolID, address(this), payable(address(this)), request);

        uint256 current = ERC20Balance(sourceToken);
        console.log('current', current);
        output = current - before;

        transferERC20toPrevPipe(sourceToken, current);
    }

    function asIAsset(IERC20[] memory tokens) private pure returns (IAsset[] memory assets) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            assets := tokens
        }
    }

}
