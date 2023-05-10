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

import "../openzeppelin/SafeMath.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/IERC20.sol";

contract MockFaucet {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  uint256 constant public DELAY = 1 days;
  uint256 constant public PART_NUMERATOR = 10; // 0.1 %
  uint256 constant public DENOMINATOR = 10000;
  address public owner;
  address[] public tokens;
  mapping(address => uint256) public usersClaims;

  constructor() {
    owner = msg.sender;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
  }

  function addToken(address _token) external onlyOwner {
    require(_token != address(0), "address is zero");
    tokens.push(_token);
  }

  function claim() external {
    uint256 lastClaimTs = usersClaims[msg.sender];
    require(lastClaimTs == 0 || block.timestamp - lastClaimTs > DELAY, "try tomorrow");
    usersClaims[msg.sender] = block.timestamp;
    for (uint256 i = 0; i < tokens.length; i++) {
      uint256 balance = IERC20(tokens[i]).balanceOf(address(this));
      if (balance < DENOMINATOR) {
        continue;
      }
      uint256 toSend = balance.mul(PART_NUMERATOR).div(DENOMINATOR);
      if (toSend == 0) {
        continue;
      }
      IERC20(tokens[i]).safeTransfer(msg.sender, toSend);
    }
  }

}
