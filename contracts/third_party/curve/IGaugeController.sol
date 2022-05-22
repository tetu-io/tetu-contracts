//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

interface IGaugeController {

  function vote_for_many_gauge_weights(address[] memory _gauges, uint[] memory _userWeights) external;

  function vote_for_gauge_weights(address gauge, uint weight) external;

}
