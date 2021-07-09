//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

interface IFeeRewardForwarder {
  function notifyPsPool(address _token, uint256 _amount) external returns (uint256);

  function notifyCustomPool(address _token, address _rewardPool, uint256 _maxBuyback) external returns (uint256);
}
