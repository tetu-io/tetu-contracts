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

    struct AaveWethData {
        address wethGateway;
        address pool;
        address lpToken;
    }

    AaveWethData private d;

    constructor(
        AaveWethData memory aaveWethData
    ) {
        d = aaveWethData;
    }

    function _aaveDepositETH(uint256 amount) public payable {
        //  AAVE: deposit MATIC -> amMATIC {WMATIC rewards}
        //  https://polygonscan.com/tx/0xab73bb28961fcee75cb5865c8cad0ff1aa7235461e8505dc9acea50078b1b12c
        //  contract WETHGateway 0xbeadf48d62acc944a06eeae0a9054a90e5a7dc97
        //  Function: depositETH(address lendingPool, address onBehalfOf, uint16 referralCode)


        IWETHGateway(d.wethGateway).depositETH{value:amount}(d.pool, address(this), 0);
    }

    function _aaveWithdrawETH(uint256 amount) internal {
        // AAVE: approve amWMATIC for AAVE
        // https://polygonscan.com/tx/0x4a82adcdd3fc296eb1945a3339d5785ecd2b6c50cbf6c960ab7dd4a367fae6bd
        // AAVE: withdraw MATIC
        // https://polygonscan.com/tx/0x517e48dc212f1980a5e79ec1d1f4e3360519596e7119a921916cc7122df3867c

        IERC20(d.lpToken).safeApprove(address(d.wethGateway), 0);
        IERC20(d.lpToken).safeApprove(address(d.wethGateway), amount);

        IWETHGateway(d.wethGateway).withdrawETH(d.pool, amount, address(this));
    }

//    function repayETH(
//        address d.Pool,
//        uint256 amount,
//        uint256 rateMode,
//        address onBehalfOf
//    ) public payable;
//
//    function borrowETH(
//        address d.Pool,
//        uint256 amount,
//        uint256 interesRateMode,
//        uint16 referralCode
//    ) public;
}
