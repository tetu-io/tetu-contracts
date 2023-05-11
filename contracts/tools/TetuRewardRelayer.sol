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

import "../openzeppelin/SafeERC20.sol";
import "../base/interfaces/IController.sol";

interface IVesting {
  function start(uint amount) external;

  function claim() external;
}

contract TetuRewardRelayer {
  using SafeERC20 for IERC20;

  uint public constant MAX_TRANSFER = 10_000_000e18;
  uint public constant DELAY = 7 days;
  uint public constant TIME_LOCK = 2 days;

  address public immutable tetu;
  address public immutable controller;

  IVesting public vesting;
  uint public lastTransfer;
  mapping(address => uint) public announces;

  event Announced(address destination, uint ts);

  constructor(address _tetu, address _controller) {
    tetu = _tetu;
    controller = _controller;
  }

  function initVesting(address _vesting) external {
    require(address(vesting) == address(0), 'inited');
    vesting = IVesting(_vesting);
  }

  function announceMove(address destination) external {
    require(IController(controller).governance() == msg.sender, "!gov");

    announces[destination] = block.timestamp;

    emit Announced(destination, block.timestamp);
  }

  function move(address destination, uint amount) external {
    require(IController(controller).governance() == msg.sender, "!gov");

    require(amount <= MAX_TRANSFER, "max");
    require((block.timestamp - lastTransfer) > DELAY, "delay");
    require(announces[destination] != 0 && block.timestamp > (announces[destination] + TIME_LOCK), "time-lock");

    uint balance = IERC20(tetu).balanceOf(address(this));

    require(balance >= amount, '!amount');

    lastTransfer = block.timestamp;
    delete announces[destination];

    IERC20(tetu).safeTransfer(destination, amount);
  }

  function start(uint amount) external {
    require(IController(controller).governance() == msg.sender, "!gov");
    vesting.start(amount);
  }

  function claim() external {
    vesting.claim();
  }


}
