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

interface IVeDelegation {
  function adjusted_balance_of(address user) external view returns (uint256);
  function totalSupply() external view returns (uint256);
}

interface IBalancerStrategy {
  function gauge() external view returns (address);
}

contract BalancerBoostCalculatorPolygon {

  IVeDelegation internal constant VOTING_ESCROW_DELEGATION_PROXY = IVeDelegation(0x0f08eEf2C785AA5e7539684aF04755dEC1347b7c);
  address internal constant GAUGE_DEPOSITOR = 0x1F46804E2D4B11CE7a61E36720DF316B7343B023;


  function getBalancerBoostInfo(address vault) external view returns (
    uint derivedBalanceBoost,
    uint ableToBoost,
    uint gaugeBalance
  ) {
    address strategy = ISmartVault(vault).strategy();

    if (IStrategy(strategy).platform() != IStrategy.Platform.BALANCER) {
      return (0, 0, 0);
    }

    address gauge = IBalancerStrategy(strategy).gauge();

    uint veBalance = VOTING_ESCROW_DELEGATION_PROXY.adjusted_balance_of(GAUGE_DEPOSITOR);
    uint veTotalSupply = VOTING_ESCROW_DELEGATION_PROXY.totalSupply();

    gaugeBalance = IERC20(gauge).balanceOf(GAUGE_DEPOSITOR);
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
