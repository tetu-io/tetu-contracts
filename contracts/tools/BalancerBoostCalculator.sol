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

import "../third_party/curve/IVotingEscrow.sol";
import "../third_party/curve/IGauge.sol";
import "../openzeppelin/IERC20.sol";
import "../base/interfaces/ISmartVault.sol";
import "../base/interfaces/IStrategy.sol";

interface IBalancerStrategy {
  function gauge() external view returns (address);
}

contract BalancerBoostCalculator {

  address internal constant BAL_LOCKER = 0x9cC56Fa7734DA21aC88F6a816aF10C5b898596Ce;
  address internal constant VE_BAL = 0xC128a9954e6c874eA3d62ce62B468bA073093F25;
  address internal constant BAL_TOKEN = 0xba100000625a3754423978a60c9317c58a424e3D;


  function getBalancerBoostInfo(address vault) external view returns (
    uint derivedBalanceBoost,
    uint ableToBoost,
    uint gaugeBalance
  ) {
    if (block.chainid != 1) {
      return (0, 0, 0);
    }

    address strategy = ISmartVault(vault).strategy();

    if (IStrategy(strategy).platform() != IStrategy.Platform.BALANCER) {
      return (0, 0, 0);
    }

    address gauge = IBalancerStrategy(strategy).gauge();

    IVotingEscrow ve = IVotingEscrow(VE_BAL);
    uint veBalance = ve.balanceOf(BAL_LOCKER);
    uint veTotalSupply = ve.totalSupply();

    gaugeBalance = IERC20(gauge).balanceOf(BAL_LOCKER);
    uint gaugeBalanceBase = gaugeBalance * 4 / 10;
    uint gaugeTotalSupply = IERC20(gauge).totalSupply();

    uint bonusBalance = gaugeTotalSupply * veBalance / veTotalSupply * 6 / 10;

    uint gaugeDerivedBalance = gaugeBalance;
    ableToBoost = 0;
    if (gaugeBalanceBase + bonusBalance < gaugeBalance) {
      gaugeDerivedBalance = gaugeBalanceBase + bonusBalance;
    } else {
      ableToBoost = (gaugeBalanceBase + bonusBalance) - gaugeBalance;
    }

    derivedBalanceBoost = gaugeDerivedBalance * 1e18 / gaugeBalanceBase;
  }

}
