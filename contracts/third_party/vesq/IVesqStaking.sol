// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IVesqStaking {

  struct Epoch {
    uint number;
    uint distribute;
    uint256 length;
    uint256 endTime;
  }

  struct Claim {
    uint deposit;
    uint gons;
    uint expiry;
    bool lock; // prevents malicious delays
  }

  function VSQ() external view returns (address);

  function sVSQ() external view returns (address);

  function epoch() external view returns (Epoch memory);

  function distributor() external view returns (address);

  function locker() external view returns (address);

  function totalBonus() external view returns (uint);

  function warmupContract() external view returns (address);

  function warmupPeriod() external view returns (uint);

  function warmupInfo(address) external view returns (Claim memory);

  function userDepositorWhitelist(address recipient, address sender) external view returns (bool);

  function checkUserDepositorWhitelist(address recipient, address sender) external view returns (bool);

  function stake(uint _amount, address _recipient) external returns (bool);

  function claim(address _recipient) external;

  function forfeit() external;

  function toggleDepositLock() external;

  function unstake(uint _amount, bool _trigger) external;

  function index() external view returns (uint);

  function rebase() external;

  function contractBalance() external view returns (uint);

}
