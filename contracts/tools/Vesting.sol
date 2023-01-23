// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../openzeppelin/SafeERC20.sol";

contract Vesting {
  using SafeERC20 for IERC20;

  /// @dev Token for vesting
  IERC20 public immutable token;
  /// @dev Will start after the cliff
  uint public immutable vestingPeriod;
  /// @dev Delay before the vesting
  uint public immutable cliffPeriod;
  /// @dev Who will receive the tokens
  address public immutable claimant;

  uint public startTs;
  uint public toDistribute;

  event Started(uint amount, uint time);
  event Claimed(address claimer, uint amount);

  constructor(address _token, uint _vestingPeriod, uint _cliffPeriod, address _claimant) {
    require(_token != address(0) && _claimant != address(0), "zero address");
    token = IERC20(_token);
    vestingPeriod = _vestingPeriod;
    cliffPeriod = _cliffPeriod;
    claimant = _claimant;
  }

  function start(uint amount) external {
    require(startTs == 0, "Already started");
    require(claimant == msg.sender, "Not claimant");

    require(IERC20(token).balanceOf(address(this)) == amount, "Incorrect amount");

    startTs = block.timestamp + cliffPeriod;
    toDistribute = amount;
    emit Started(amount, block.timestamp);
  }

  function claim() external {
    address _claimant = claimant;
    require(_claimant == msg.sender, "Not claimant");
    require(startTs != 0, "Not started");

    uint _startTs = startTs;
    require(_startTs < block.timestamp, "Too early");

    uint timeDiff = block.timestamp - _startTs;
    uint toClaim = timeDiff * toDistribute / vestingPeriod;
    uint balance = token.balanceOf(address(this));

    toClaim = balance < toClaim ? balance : toClaim;
    require(toClaim != 0, "Nothing to claim");
    token.safeTransfer(_claimant, toClaim);

    startTs = block.timestamp;
    emit Claimed(_claimant, toClaim);
  }


}
