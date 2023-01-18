// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../third_party/IVeDistributor.sol";

contract MockVeDist is IVeDistributor {

  function rewardToken() external pure override returns (address) {
    return address(0);
  }

  function checkpoint() external pure override {
    // noop
  }

  function checkpointTotalSupply() external pure override {
    // noop
  }

  function claim(uint /*_tokenId*/) external pure override returns (uint) {
    // noop
    return 0;
  }

}
