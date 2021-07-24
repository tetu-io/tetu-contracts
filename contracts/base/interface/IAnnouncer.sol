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
    Governance,
    Dao,
    FeeRewardForwarder,
    Bookkeeper,
    MintHelper,
    RewardToken,
    FundToken,
    PsVault,
    Fund,
    // TimeLockedRatios
    PsRatio,
    FundRatio,
    // TimeLockedTokenMoves
    ControllerSalvage,
    StrategySalvage,
    FundSalvage,
    TetuProxyUpdate,
    StrategyUpgrade,
    Mint,
    Announcer
  }

  /// @dev Holder for human readable info
  struct TimeLockInfo {
    TimeLockOpCodes opCode;
    address target;
    address[] adrValues;
    uint256[] numValues;
  }

  function clearAnnounce(bytes32 opHash, TimeLockOpCodes opCode, address target) external;

  function timeLockSchedule(bytes32 opHash) external returns (uint256);

  // ************ DAO ACTIONS *************
  function announceRatioChange(TimeLockOpCodes opCode, uint256 numerator, uint256 denominator) external;

}
