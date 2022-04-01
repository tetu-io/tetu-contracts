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

interface IStablePool  {

    // This contract uses timestamps to slowly update its Amplification parameter over time. These changes must occur
    // over a minimum time period much larger than the blocktime, making timestamp manipulation a non-issue.
    // solhint-disable not-rely-on-time

    // Amplification factor changes must happen over a minimum period of one day, and can at most divide or multiple the
    // current value by 2 every day.
    // WARNING: this only limits *a single* amplification change to have a maximum rate of change of twice the original
    // value daily. It is possible to perform multiple amplification changes in sequence to increase this value more
    // rapidly: for example, by doubling the value every day it can increase by a factor of 8 over three days (2^3).
//    uint256 private constant _MIN_UPDATE_TIME = 1 days;
//    uint256 private constant _MAX_AMP_UPDATE_DAILY_RATE = 2;
//
//    bytes32 private _packedAmplificationData;
//
//    event AmpUpdateStarted(uint256 startValue, uint256 endValue, uint256 startTime, uint256 endTime);
//    event AmpUpdateStopped(uint256 currentValue);

    // To track how many tokens are owed to the Vault as protocol fees, we measure and store the value of the invariant
    // after every join and exit. All invariant growth that happens between join and exit events is due to swap fees.
//    uint256 private _lastInvariant;
    // Because the invariant depends on the amplification parameter, and this value may change over time, we should only
    // compare invariants that were computed using the same value. We therefore store it whenever we store
    // _lastInvariant.
//    uint256 private _lastInvariantAmp;

//    enum JoinKind { INIT, EXACT_TOKENS_IN_FOR_BPT_OUT, TOKEN_IN_FOR_EXACT_BPT_OUT }
//    enum ExitKind { EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, EXACT_BPT_IN_FOR_TOKENS_OUT, BPT_IN_FOR_EXACT_TOKENS_OUT }


    /**
     * @dev This function returns the appreciation of one BPT relative to the
     * underlying tokens. This starts at 1 when the pool is created and grows over time
     */
    function getRate() external view returns (uint256);

    function getAmplificationParameter()
    external
    view
    returns (
        uint256 value,
        bool isUpdating,
        uint256 precision
    );


}
