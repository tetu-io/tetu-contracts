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

import "../base/governance/ControllableV2.sol";
import "../openzeppelin/SafeERC20.sol";


contract TetuUnpacking {
  using SafeERC20 for IERC20;

  address constant public TETU = 0x255707B70BF90aa112006E1b07B9AeA6De021424;
  /// @dev 2 years linear vesting contract
  address constant public DEV_FUND_VESTING = 0xDA0238dC031E431f147f00D04A3263E9E4B73A3C;
  /// @dev We will bridge TETU from our Gnosis Safe via multichain bridge
  address constant public TETU_BRIDGE = 0xcc16d636dD05b52FF1D8B9CE09B09BC62b11412B;

  function process() external {
    uint amount = IERC20(TETU).balanceOf(address(this));


    uint toDevFund = amount * 3 / 10;
    uint toBridge = amount - toDevFund;

    require(toDevFund != 0, 'zero toDevFund');
    require(toBridge != 0, 'zero toBridge');

    IERC20(TETU).safeTransfer(DEV_FUND_VESTING, toDevFund);
    IERC20(TETU).safeTransfer(TETU_BRIDGE, toBridge);
  }


}
