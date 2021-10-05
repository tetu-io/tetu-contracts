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

    address public balancerVaultAddress;
    address public sourceTokenAddress;
    uint256 public balancerPoolID;

    constructor(
        address _balancerVaultAddress,
        address _sourceTokenAddress,
        uint256 _balancerPoolID
    ) public {
        balancerVaultAddress = _balancerVaultAddress;
        sourceTokenAddress = _sourceTokenAddress;
        balancerPoolID = _balancerPoolID;
    }

    function _balancerJoinPool(uint256 amount) internal {
        IERC20(sourceTokenAddress).safeApprove(balancerVaultAddress, 0);
        IERC20(sourceTokenAddress).safeApprove(balancerVaultAddress, amount);

        //TODO try catch with gas limit
        //  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)
        JoinPoolRequest memory request; //TODO fill in tis record

        IBVault(balancerV2Address).joinPool(_balancerPoolID, address(this), address(this), request); //TODO
    }
}

