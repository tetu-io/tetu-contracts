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

import "./../../../../third_party/aave/IWETHGateway.sol";

contract AaveWethConnector {

    IWETHGateway wethGateway;
    address public lendingPool;

    constructor(
        address _wethGateway,
        address _lendingPool
    ) public {
        wethGateway = IWETHGateway(_wethGateway);
        lendingPool = _lendingPool;
    }

    function _aaveDepositETH(uint256 amount) internal payable {
        //TODO try catch with gas limit
        wethGateway.depositETH.value(amount)(lendingPool, address(this), 0);
    }

    function _aaveWithdrawETH(uint256 amount) internal {
        //TODO try catch with gas limit
        wethGateway.depositETH(lendingPool, amount, address(this));
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
