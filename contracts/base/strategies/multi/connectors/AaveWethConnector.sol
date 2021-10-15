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
import "./../../../../third_party/aave/IWETHGateway.sol";

contract AaveWethConnector {
    using SafeERC20 for IERC20;

    IWETHGateway wethGateway;
    address public lendingPool;
    address public lpToken;

    constructor(
        address _wethGateway,
        address _lendingPool,
        address _lpToken
    ) public {
        wethGateway = IWETHGateway(_wethGateway);
        lendingPool = _lendingPool;
        lpToken     = _lpToken;
    }

    function _aaveDepositETH(uint256 amount) public payable {
        //TODO try catch with gas limit
        wethGateway.depositETH{value:amount}(lendingPool, address(this), 0);
    }

    function _aaveWithdrawETH(uint256 amount) internal {
        IERC20(lpToken).safeApprove(address(wethGateway), 0);
        IERC20(lpToken).safeApprove(address(wethGateway), amount);
        //TODO try catch with gas limit
        wethGateway.withdrawETH(lendingPool, amount, address(this));
    }

//    function repayETH(
//        address lendingPool,
//        uint256 amount,
//        uint256 rateMode,
//        address onBehalfOf
//    ) public payable;
//
//    function borrowETH(
//        address lendingPool,
//        uint256 amount,
//        uint256 interesRateMode,
//        uint16 referralCode
//    ) public;
}
