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

import "../../openzeppelin/SafeERC20.sol";

/// @title Should receive tokens on one chain and transfer on another.
/// @author belbix
contract TokenRetranslator {
  using SafeERC20 for IERC20;

  bool public initialized;
  address public owner;

  event Sent(address token, address destination, uint amount);

  modifier onlyOwner() {
    require(msg.sender == owner, "AR: Not owner");
    _;
  }

  modifier onlyOnce() {
    require(!initialized, "AR: Already initialized");
    _;
    initialized = true;
  }

  function initialize(address _owner) external onlyOnce {
    owner = _owner;
  }

  function sendTo(address _token, address _destination, uint _amount) external onlyOwner {
    IERC20(_token).safeTransfer(_destination, _amount);
    emit Sent(_token, _destination, _amount);
  }

}
