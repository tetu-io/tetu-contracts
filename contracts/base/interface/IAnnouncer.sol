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

interface IAnnouncer {

  /// @dev Time lock operation codes
  enum TimeLockOpCodes {
    // TimeLockedAddresses
    Governance, // 0
    Dao, // 1
    FeeRewardForwarder, // 2
    Bookkeeper, // 3
    MintHelper, // 4
    RewardToken, // 5
    FundToken, // 6
    PsVault, // 7
    Fund, // 8
    // TimeLockedRatios
    PsRatio, // 9
    FundRatio, // 10
    // TimeLockedTokenMoves
    ControllerTokenMove, // 11
    StrategyTokenMove, // 12
    FundTokenMove, // 13
    // Other
    TetuProxyUpdate, // 14
    StrategyUpgrade, // 15
    Mint, // 16
    Announcer, // 17
    ZeroPlaceholder, //18
    VaultController, //19
    RewardBoostDuration, //20
    RewardRatioWithoutBoost, //21
    VaultStop //22
  }

  /// @dev Holder for human readable info
  struct TimeLockInfo {
    TimeLockOpCodes opCode;
    bytes32 opHash;
    address target;
    address[] adrValues;
    uint256[] numValues;
  }

  function clearAnnounce(bytes32 opHash, TimeLockOpCodes opCode, address target) external;

  function timeLockSchedule(bytes32 opHash) external returns (uint256);

  function timeLockInfo(uint256 idx) external returns (TimeLockInfo memory);

  // ************ DAO ACTIONS *************
  function announceRatioChange(TimeLockOpCodes opCode, uint256 numerator, uint256 denominator) external;

}
