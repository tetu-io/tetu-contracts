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

import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../../third_party/aave/ILendingPool.sol";
import "../../../../../third_party/aave/ILendingPoolAddressesProvider.sol";
import "../../../../../third_party/aave/IAaveProtocolDataProvider.sol";

contract AaveConnector {

    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address public aaveUnderlying;
    address public aTokenAddress;

    address public lendingPoolProvider;
    address public protocolDataProvider;

    constructor(
        address _underlying,
        address _lendingPoolProvider,
        address _protocolDataProvider
    ) public {
        aaveUnderlying = _underlying;
        lendingPoolProvider = _lendingPoolProvider;
        protocolDataProvider = _protocolDataProvider;
        aTokenAddress = aToken();
    }

    function lendingPool() public view returns (address) {
        return ILendingPoolAddressesProvider(lendingPoolProvider).getLendingPool();
    }

    function aToken() public view returns (address) {
        (address newATokenAddress,,) =
        IAaveProtocolDataProvider(protocolDataProvider).getReserveTokensAddresses(aaveUnderlying);
        return newATokenAddress;
    }

    function _aaveDeposit(uint256 amount) internal {
        address lendPool = lendingPool();
        IERC20(aaveUnderlying).safeApprove(lendPool, 0);
        IERC20(aaveUnderlying).safeApprove(lendPool, amount);

        ILendingPool(lendPool).deposit(
            aaveUnderlying,
            amount,
            address(this),
            0 // referral code
        );
    }

    function _aaveWithdrawAll() internal {
        _aaveWithdraw(uint256(-1));
    }

    function _aaveWithdraw(uint256 amount) internal {
        address lendPool = lendingPool();
        IERC20(aTokenAddress).safeApprove(lendPool, 0);
        IERC20(aTokenAddress).safeApprove(lendPool, amount);
        uint256 maxAmount = IERC20(aTokenAddress).balanceOf(address(this));

        uint256 amountWithdrawn = ILendingPool(lendPool).withdraw(
            aaveUnderlying,
            amount,
            address(this)
        );

        require(
            amountWithdrawn == amount ||
            (amount == uint256(-1) && maxAmount == IERC20(aaveUnderlying).balanceOf(address(this))),
            "Did not withdraw requested amount"
        );
    }

}
