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
pragma solidity 0.8.4;
pragma experimental ABIEncoderV2;


// This contract relies on tons of immutable state variables to perform efficient lookup, without resorting to storage
// reads. Because immutable arrays are not supported, we instead declare a fixed set of state variables plus a total
// count, resulting in a large number of state variables.

// solhint-disable max-states-count

/**
 * @dev Reference implementation for the base layer of a Pool contract that manages a single Pool with an immutable set
 * of registered tokens, no Asset Managers, an admin-controlled swap fee percentage, and an emergency pause mechanism.
 *
 * Note that neither swap fees nor the pause mechanism are used by this contract. They are passed through so that
 * derived contracts can use them via the `_addSwapFeeAmount` and `_subtractSwapFeeAmount` functions, and the
 * `whenNotPaused` modifier.
 *
 * No admin permissions are checked here: instead, this contract delegates that to the Vault's own Authorizer.
 *
 * Because this contract doesn't implement the swap hooks, derived contracts should generally inherit from
 * BaseGeneralPool or BaseMinimalSwapInfoPool. Otherwise, subclasses must inherit from the corresponding interfaces
 * and implement the swap callbacks themselves.
 */
interface IBasePool {
//    uint256 private constant _MIN_TOKENS = 2;
//    uint256 private constant _MAX_TOKENS = 8;
//
//    // 1e18 corresponds to 1.0, or a 100% fee
//    uint256 private constant _MIN_SWAP_FEE_PERCENTAGE = 1e12; // 0.0001%
//    uint256 private constant _MAX_SWAP_FEE_PERCENTAGE = 1e17; // 10%
//
//    uint256 private constant _MINIMUM_BPT = 1e6;
//
//    uint256 internal _swapFeePercentage;
//
//    IVault private immutable _vault;
//    bytes32 private immutable _poolId;
//    uint256 private immutable _totalTokens;
//
//    IERC20 internal immutable _token0;
//    IERC20 internal immutable _token1;
//    IERC20 internal immutable _token2;
//    IERC20 internal immutable _token3;
//    IERC20 internal immutable _token4;
//    IERC20 internal immutable _token5;
//    IERC20 internal immutable _token6;
//    IERC20 internal immutable _token7;
//
//    // All token balances are normalized to behave as if the token had 18 decimals. We assume a token's decimals will
//    // not change throughout its lifetime, and store the corresponding scaling factor for each at construction time.
//    // These factors are always greater than or equal to one: tokens with more than 18 decimals are not supported.
//
//    uint256 private immutable _scalingFactor0;
//    uint256 private immutable _scalingFactor1;
//    uint256 private immutable _scalingFactor2;
//    uint256 private immutable _scalingFactor3;
//    uint256 private immutable _scalingFactor4;
//    uint256 private immutable _scalingFactor5;
//    uint256 private immutable _scalingFactor6;
//    uint256 private immutable _scalingFactor7;
//
//    event SwapFeePercentageChanged(uint256 swapFeePercentage);


    // Getters / Setters

    function getVault() external view returns (address);

    function getPoolId() external view returns (bytes32);

    function getSwapFeePercentage() external view returns (uint256);

}
