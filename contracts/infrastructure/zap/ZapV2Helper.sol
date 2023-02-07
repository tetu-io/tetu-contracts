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

import "../../base/interface/ISmartVault.sol";
import "../../third_party/balancer/IBPT.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../openzeppelin/IERC20.sol";

contract ZapV2Helper {
    address private constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;

    /// @dev Quote out for ComposableStablePool with Phantom BPT and without it.
    ///      This unusual algorithm is used due to the impossibility of using EXACT_BPT_IN_FOR_ALL_TOKENS_OUT.
    ///      We think it's can be better than queryBatchSwap for such pools.
    function quoteOutBalancer(address vault, address[] memory assets, uint shareAmount) external view returns(uint[] memory) {
        address bpt = ISmartVault(vault).underlying();
        bytes32 poolId = IBPT(bpt).getPoolId();
        uint bptAmountOut = shareAmount * ISmartVault(vault).underlyingBalanceWithInvestment() / IERC20(vault).totalSupply();
        uint len = assets.length;
        uint bptNotInPool;
        uint i;
        (, uint[] memory tokensBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(poolId);
        for (; i < len; i++) {
            if (assets[i] == bpt) {
                bptNotInPool = IERC20(bpt).totalSupply() - tokensBalances[i];
            }
        }

        if (bptNotInPool == 0) {
            bptNotInPool = IERC20(bpt).totalSupply();
        }

        uint[] memory amounts = new uint[](len);
        for (i = 0; i < len; i++) {
            if (assets[i] != bpt) {
                amounts[i] = tokensBalances[i] * bptAmountOut / bptNotInPool * 999998 / 1000000;
            }
        }

        return amounts;
    }
}