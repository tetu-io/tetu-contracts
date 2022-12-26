// SPDX-License-Identifier: ISC
pragma solidity 0.8.4;

import "../../openzeppelin/IERC20.sol";
import "../../third_party/balancer/IBalancerHelper.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../base/interface/ISmartVault.sol";

contract ZapTetuBalHelper {
    address public constant TETU_VAULT = 0xBD06685a0e7eBd7c92fc84274b297791F3997ed3; // TETU_ETH-BAL_tetuBAL_BPT_V3
    address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address public constant BALANCER_VAULT_TOKEN0 = 0x3d468AB2329F296e1b9d8476Bb54Dd77D8c2320f; // 20WETH-80BAL
    address public constant BALANCER_VAULT_TOKEN1 = 0x7fC9E0Aa043787BFad28e29632AdA302C790Ce33; // TETU_ST_BAL
    bytes32 public constant BALANCER_POOL_ID = 0xb797adfb7b268faeaa90cadbfed464c76ee599cd0002000000000000000005ba;
    bytes32 public constant BALANCER_W_POOL_ID = 0x3d468ab2329f296e1b9d8476bb54dd77d8c2320f000200000000000000000426;
    address public constant BALANCER_HELPER = 0x239e55F427D44C3cc793f49bFB507ebe76638a2b;
    address public constant ASSET0 = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619; // WETH
    address public constant ASSET1 = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3; // BAL

    function quoteInSharedAmount(uint _asset0Amount, uint _asset1Amount) external returns(uint) {
        IBalancerHelper helper = IBalancerHelper(BALANCER_HELPER);
        address[] memory _poolTokens = new address[](2);
        _poolTokens[0] = ASSET0;
        _poolTokens[1] = ASSET1;
        uint[] memory amounts = new uint[](2);
        amounts[0] = _asset0Amount;
        amounts[1] = _asset1Amount;
        (uint wBptBalance,) = helper.queryJoin(
            BALANCER_W_POOL_ID,
            address(this),
            payable(address(this)),
            IVault.JoinPoolRequest({
                assets : _poolTokens,
                maxAmountsIn : amounts,
                userData : abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amounts, 0),
                fromInternalBalance : false
            })
        );
        // swap or deposit part of part tokens to smart vault
        (, uint[] memory rootBptVaultBalances,) = IBVault(BALANCER_VAULT).getPoolTokens(BALANCER_POOL_ID);
        // rough calculations without current price, pool fee, impact
        uint canBuySmartVaultTokensByGoodPrice = rootBptVaultBalances[1] > rootBptVaultBalances[0] ? (rootBptVaultBalances[1] - rootBptVaultBalances[0]) / 2 : 0;
        uint needToMintSmartVaultTokens;
        if (canBuySmartVaultTokensByGoodPrice != 0 && canBuySmartVaultTokensByGoodPrice < wBptBalance / 2) {
            needToMintSmartVaultTokens = wBptBalance / 2 - canBuySmartVaultTokensByGoodPrice;
        }
        if (canBuySmartVaultTokensByGoodPrice == 0) {
            needToMintSmartVaultTokens = wBptBalance / 2;
        }
        _poolTokens[0] = BALANCER_VAULT_TOKEN0;
        _poolTokens[1] = BALANCER_VAULT_TOKEN1;
        amounts[0] = wBptBalance - needToMintSmartVaultTokens;
        amounts[1] = needToMintSmartVaultTokens;
        (uint rootBptOut,) = helper.queryJoin(
            BALANCER_POOL_ID,
            address(this),
            payable(address(this)),
            IVault.JoinPoolRequest({
                assets : _poolTokens,
                maxAmountsIn : amounts,
                userData : abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amounts, 0),
                fromInternalBalance : false
            })
        );
        return rootBptOut * IERC20(TETU_VAULT).totalSupply() / ISmartVault(TETU_VAULT).underlyingBalanceWithInvestment();
    }
}