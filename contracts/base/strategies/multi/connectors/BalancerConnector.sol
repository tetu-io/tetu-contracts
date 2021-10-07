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
import "./../../../../third_party/balancer/IBVault.sol";

contract BalancerConnector {
    using SafeERC20 for IERC20;

    string private constant _WRONG_SOURCE_TOKEN = "BC: wrong source token or its index";

    address public balancerVaultAddress;
    address public sourceTokenAddress;
    uint256 public balancerPoolID;
    uint256 public sourceTokenIndexAtPool;

    constructor(
        address _balancerVaultAddress,
        address _sourceTokenAddress,
        uint256 _balancerPoolID,
        uint256 _sourceTokenIndexAtPool
    ) public {
        balancerVaultAddress = _balancerVaultAddress;
        sourceTokenAddress = _sourceTokenAddress;
        balancerPoolID = _balancerPoolID;
        sourceTokenIndexAtPool = _sourceTokenIndexAtPool;
    }

    // from https://github.com/balancer-labs/balancer-v2-monorepo/blob/f45076067b68b27ea023632e69349e3051746cd4/pkg/solidity-utils/contracts/helpers/ERC20Helpers.sol
    function _asIAsset(IERC20[] memory tokens) pure returns (IAsset[] memory assets) {
        // solhint-disable-next-line no-inline-assembly
        assembly {
            assets := tokens
        }
    }

    function _balancerJoinPool(uint256 amount) internal {
        IERC20(sourceTokenAddress).safeApprove(balancerVaultAddress, 0);
        IERC20(sourceTokenAddress).safeApprove(balancerVaultAddress, amount);

        //  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)
        IERC20[] memory tokens = IBVault(balancerVaultAddress).getPoolTokens(_balancerPoolID);
        require( sourceTokenAddress==address(tokens[sourceTokenIndexAtPool]), _WRONG_SOURCE_TOKEN);
        uint256[] maxAmountsIn = [0,0,0,0];
        maxAmountsIn[sourceTokenIndexAtPool] = amount;

        IBVault.JoinPoolRequest memory request = IVault.JoinPoolRequest({
            assets: _asIAsset(tokens),
            maxAmountsIn: maxAmountsIn,
            userData: "",
            fromInternalBalance: false
        });

        //TODO try catch with gas limit
        IBVault(balancerVaultAddress).joinPool(_balancerPoolID, address(this), address(this), request);
    }

    function _balancerExitPool(uint256 amount) internal {
        IERC20[] memory tokens = IBVault(balancerVaultAddress).getPoolTokens(_balancerPoolID);
        require( sourceTokenAddress==address(tokens[sourceTokenIndexAtPool]), _WRONG_SOURCE_TOKEN);
        uint256[] minAmountsOut = [0,0,0,0];
        minAmountsOut[sourceTokenIndexAtPool] = amount;

        IBVault.JoinPoolRequest memory request = IVault.JoinPoolRequest({
            assets: _asIAsset(tokens),
            minAmountsOut: minAmountsOut,
            userData: "",
            fromInternalBalance: false
        });

        //TODO try catch with gas limit
        IBVault(balancerVaultAddress).joinPool(_balancerPoolID, address(this), address(this), request);
    }
}

