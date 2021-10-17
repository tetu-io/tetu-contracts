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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./../../../../third_party/balancer/IBVault.sol";

contract BalancerConnector {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    struct BalancerData {
        address vault;
        address sourceToken;
        bytes32 poolID;
        uint256 tokenIndexAtPool;
        address lpToken;
        address rewardToken;
    }

    string private constant _WRONG_SOURCE_TOKEN = "BC: wrong source token or its index";

    BalancerData private d;

    constructor(
        BalancerData memory balancerData
    ) {
        d = balancerData;
    }

    // from https://github.com/balancer-labs/balancer-v2-monorepo/blob/f45076067b68b27ea023632e69349e3051746cd4/pkg/solidity-utils/contracts/helpers/ERC20Helpers.sol
    function _asIAsset(IERC20[] memory tokens) public pure returns (IAsset[] memory assets) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            assets := tokens
        }
    }

    function _balancerJoinPool(uint256 amount) internal {
        IERC20(d.sourceToken).safeApprove(d.vault, 0);
        IERC20(d.sourceToken).safeApprove(d.vault, amount);

        //  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)
        (IERC20[] memory tokens,,) = IBVault(d.vault).getPoolTokens(d.poolID);
        require( d.sourceToken ==address(tokens[d.tokenIndexAtPool]), _WRONG_SOURCE_TOKEN);
        uint256[] memory maxAmountsIn = new uint256[](4);
        maxAmountsIn[d.tokenIndexAtPool] = amount;

        // example found at https://etherscan.io/address/0x5C6361f4cC18Df63D07Abd1D59A282d82C27Ad17#code#F2#L162
        uint256 minAmountOut = 1;
        bytes memory userData = abi.encode(IBVault.JoinKind.TOKEN_IN_FOR_EXACT_BPT_OUT, maxAmountsIn, minAmountOut); //TODO check
        IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
            assets: _asIAsset(tokens),
            maxAmountsIn: maxAmountsIn,
            userData: userData,
            fromInternalBalance: false
        });

        //TODO try catch with gas limit
        IBVault(d.vault).joinPool(d.poolID, address(this), address(this), request);
    }

    function _balancerExitPool(uint256 amount) internal {
        (IERC20[] memory tokens,,) = IBVault(d.vault).getPoolTokens(d.poolID);
        require( d.sourceToken ==address(tokens[d.tokenIndexAtPool]), _WRONG_SOURCE_TOKEN);
        uint256[] memory minAmountsOut = new uint256[](4);
        minAmountsOut[d.tokenIndexAtPool] = amount;
        uint256 bptAmountIn = _balancerGetExitAmount(amount);

        //TODO !!! use code from deployed contract (see example transaction at AaveMaiBalStrategyBase), not from master branch
        bytes memory userData = abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, bptAmountIn, d.tokenIndexAtPool); //TODO check
        IBVault.ExitPoolRequest memory request = IBVault.ExitPoolRequest({
            assets: _asIAsset(tokens),
            minAmountsOut: minAmountsOut,
            userData: userData,
            toInternalBalance: false
        });

        //TODO try catch with gas limit
        IBVault(d.vault).exitPool(d.poolID, address(this), payable(address(this)), request);
    }

    function _balancerGetExitAmount(uint256 amount) internal view returns (uint256) {
        uint256 total = IERC20(d.lpToken).balanceOf(address(this));
        //TODO !!! Convert BPT LP Tokens to MAI amount -> StableMath._calcTokenOutGivenExactBptIn
        return total;
    }
}

