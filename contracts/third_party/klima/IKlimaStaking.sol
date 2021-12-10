// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IKlimaStaking {

  struct Epoch {
    uint length;
    uint number;
    uint endBlock;
    uint distribute;
  }

  struct Claim {
    uint deposit;
    uint gons;
    uint expiry;
    bool lock; // prevents malicious delays
  }

  function KLIMA() external view returns (address);

  function sKLIMA() external view returns (address);

  function epoch() external view returns (Epoch memory);

  function distributor() external view returns (address);

  function locker() external view returns (address);

  function totalBonus() external view returns (uint);

  function warmupContract() external view returns (address);

  function warmupPeriod() external view returns (uint);

  function warmupInfo(address) external view returns (Claim memory);

  function stake(uint _amount, address _recipient) external returns (bool);

  function claim(address _recipient) external;

  function forfeit() external;

  function toggleDepositLock() external;

  function unstake(uint _amount, bool _trigger) external;

  function index() external view returns (uint);

  function rebase() external;

  function contractBalance() external view returns (uint);

}
