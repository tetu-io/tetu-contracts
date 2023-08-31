//SPDX-License-Identifier: Unlicense

pragma solidity 0.8.4;

interface IConvexFactory {

  function get_gauge_from_lp_token(address _arg0) external view returns (address);

  function is_valid_gauge(address _gauge) external view returns (bool);

}
