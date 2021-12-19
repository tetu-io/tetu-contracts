// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.


import "./RewardsAssetManager.sol";
import "../../iron/CompleteRToken.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "hardhat/console.sol";

pragma solidity 0.8.4;
pragma experimental ABIEncoderV2;

contract IronRTokenAssetManager is RewardsAssetManager {
    using SafeERC20 for IERC20;

    // IRON CONTROLLER
    address public constant _IRON_CONTROLLER = address(0xF20fcd005AFDd3AD48C85d0222210fe168DDd10c);
    // rewards
    address private constant ICE = address(0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef);

    address public rToken;

    address public underlyingToken; // wbtc

    uint256 private _aum;

    // @notice rewards distributor for pool which owns this asset manager
    // IMultiRewards public distributor;  // todo Strategy

    constructor(
        IVault vault,
        bytes32 _poolId,
        address _underlyingToken,
        address _rToken
    ) RewardsAssetManager(vault, _poolId, IERC20(_underlyingToken)) {
        rToken = _rToken;
        underlyingToken = _underlyingToken;
    }

    /**
     * @dev Should be called in same transaction as deployment through a factory contract
     * @param poolId - the id of the pool
     */
    function initialize(bytes32 poolId) public {
        _initialize(poolId); //todo not sure if needed
    }

    /**
     * @dev Deposits capital into Iron
     * @param amount - the amount of tokens being deposited
     * @return the amount deposited
     */
    function _invest(uint256 amount, uint256) internal override returns (uint256) {
        uint256 balance = IERC20(underlyingToken).balanceOf(address(this));
        if (amount < balance) {
            balance = amount;
        }
        IERC20(underlyingToken).safeApprove(rToken, 0);
        IERC20(underlyingToken).safeApprove(rToken, balance);
        require(CompleteRToken(rToken).mint(balance) == 0, "IFS: Supplying failed");
         _aum = CompleteRToken(rToken).balanceOfUnderlying(address(this));
        console.log("invest > AUM: %s", _aum);

        console.log("invested %s of  %s", balance, underlyingToken);
        return balance;
    }

    /**
     * @dev Withdraws capital out of Iron
     * @param amountUnderlying - the amount to withdraw
     * @return the number of tokens to return to the vault
     */
    function _divest(uint256 amountUnderlying, uint256) internal override returns (uint256) {
        console.log("_divest request amountUnderlying: %s", amountUnderlying);
        amountUnderlying = Math.min(amountUnderlying, _aum);
        if (amountUnderlying > 0) {
            CompleteRToken(rToken).redeemUnderlying(amountUnderlying);
        }
        // what to do if can't withdraw?
        _aum = CompleteRToken(rToken).balanceOfUnderlying(address(this));
        console.log("divest > AUM: %s", _aum);
        console.log("divested %s of  %s", amountUnderlying, underlyingToken);

        return amountUnderlying;
    }


    /**
     * @dev Checks RToken balance (ever growing)
     */
    function _getAUM() internal view override returns (uint256) {
        return _aum;
    }

    function claimRewards() public {
        // Claim Iron from incentives controller
        address[] memory markets = new address[](1);
        markets[0] = rToken;
        IronControllerInterface(_IRON_CONTROLLER).claimReward(address(this), markets);
    }
}
