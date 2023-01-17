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

import "../../third_party/balancer/IBVault.sol";
import "../../third_party/balancer/IBPT.sol";
import "../../third_party/balancer/IBalancerHelper.sol";
import "./ZapV2CommonLibrary.sol";

library ZapV2BalancerCommonLibrary {
    address internal constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address internal constant BALANCER_HELPER = 0x239e55F427D44C3cc793f49bFB507ebe76638a2b;

    function _quoteJoinBalancer(bytes32 poolId, address[] memory assets, uint[] memory amounts, address bpt) internal returns(uint) {
        uint len = assets.length;
        uint userDataAmountsLen;
        for (uint i; i < len; i++) {
            if (assets[i] != bpt) {
                userDataAmountsLen++;
            }
        }

        uint[] memory userDataAmounts = new uint[](userDataAmountsLen);
        uint k;
        for (uint i = 0; i < len; i++) {
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
                    ZapV2CommonLibrary._approveIfNeeds(assets[i], amounts[i], BALANCER_VAULT);
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

            ZapV2CommonLibrary._approveIfNeeds(tokenIn, amountIn, BALANCER_VAULT);
            IBVault(BALANCER_VAULT).swap(singleSwapData, fundManagementStruct, 1, block.timestamp);
        }
    }

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
}
