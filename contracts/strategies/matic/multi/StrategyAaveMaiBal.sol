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

import "../../../base/strategies/multi/AaveMaiBalStrategyBase.sol";
// todo remove
import "../../../base/strategies/multi/pipes/MaiStablecoinPipe.sol";
import "../../../base/strategies/multi/pipes/AaveWethPipe.sol";
import "../../../base/strategies/multi/pipes/AaveAmPipe.sol";
import "../../../base/strategies/multi/pipes/MaiCamPipe.sol";
import "../../../base/strategies/multi/pipes/BalVaultPipe.sol";
import "../../../base/strategies/multi/pipes/UnwrappingPipe.sol";
import "../../../base/strategies/multi/pipes/NoopPipe.sol";

/// @title AAVE->MAI->BAL Multi Strategy Polygon Implementation. Compatible with: WMATIC, AAVE, DAI, WETH, WBTC
/// @author belbix, bogdoslav
contract StrategyAaveMaiBal is AaveMaiBalStrategyBase {

  // @dev https://docs.mai.finance/borrowing-incentives
  // @dev 135% - liquidation (110% - camDAI), 135+25=160 - minimum for incentives
  // @dev 135+270=405 max percentage for incentives
  uint16 private maiDefaultCollateralToDebtTargetPercentage = 200;
  uint16 private constant  _maxTargetPercentageImbalance = 10;

  /// @notice Address representing ether (bnb, matic)
  address private constant _ETHER = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  address private constant _WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
  address private constant _amWMATIC = 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4; // Aave Matic Market WMATIC
  address private constant _camWMATIC = 0x7068Ea5255cb05931EFa8026Bd04b18F3DeB8b0B; // Compounding Aave Market Matic
  address private constant _camWMATICVault = 0x88d84a85A87ED12B8f098e8953B322fF789fCD1a;

  address private constant _AAVE = 0xD6DF932A45C0f255f85145f286eA0b292B21C90B;
  address private constant _amAAVE = 0x1d2a0E5EC8E5bBDCA5CB219e649B565d8e5c3360; // Aave Matic Market AAVE
  address private constant _camAAVE = 0xeA4040B21cb68afb94889cB60834b13427CFc4EB; // Compounding Aave Market AAVE
  address private constant _camAAVEVault = 0x578375c3af7d61586c2C3A7BA87d2eEd640EFA40;

  address private constant _DAI = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063;
  address private constant _amDAI = 0x27F8D03b3a2196956ED754baDc28D73be8830A6e; // Aave Matic Market DAI
  address private constant _camDAI = 0xE6C23289Ba5A9F0Ef31b8EB36241D5c800889b7b; // Compounding Aave Market DAI
  address private constant _camDAIVault = 0xD2FE44055b5C874feE029119f70336447c8e8827; // camDAI MAI Vault (camDAIMVT)

  address private constant _WETH = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
  address private constant _amWETH = 0x28424507fefb6f7f8E9D3860F56504E4e5f5f390;
  address private constant _camWETH = 0x0470CD31C8FcC42671465880BA81D631F0B76C1D;
  address private constant _camWETHVault = 0x11A33631a5B5349AF3F165d2B7901A4d67e561ad; // camWETH MAI Vault (camWEMVT)

  address private constant _WBTC = 0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6;
  address private constant _amWBTC = 0x5c2ed810328349100A66B82b78a1791B101C9D61;
  address private constant _camWBTC = 0xBa6273A78a23169e01317bd0f6338547F869E8Df;
  address private constant _camWBTCVault = 0x7dDA5e1A389E0C1892CaF55940F5fcE6588a9ae0; // camWBTC MAI Vault (camWBMVT)


  address private constant _miMATIC = 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1;
  address private constant _QI = 0x580A84C73811E1839F75d86d75d88cCa0c241fF4; // MAI reward token
  address private constant _BAL = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;

  address private constant _AAVE_POOL = 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf;

  address[] private _rewardTokensArray = [_WMATIC, _QI, _BAL];

  constructor(
    address _controller,
    address _vault,
    address _underlying,
    address[] memory _pipes
  ) AaveMaiBalStrategyBase(_controller, _underlying, _vault, _rewardTokensArray) {
    _initPipes(_pipes);
  }

  /// @dev 0 - AaveAmPipe
  ///      1 - MaiCamPipe
  ///      2 - MaiStablecoinPipe
  ///      3 - BalVaultPipe
  function _initPipes(address[] memory _pipes) private {
    require(_pipes.length == 4, "Wrong pipes");
    for (uint i; i < _pipes.length; i++) {
      IPipe(_pipes[i]).setPipeline(address(this));
      _addPipe(IPipe(_pipes[i]));
    }
    // pipe with index 2 must be MaiStablecoinPipe
    _maiStablecoinPipe = IMaiStablecoinPipe(_pipes[2]);
  }


}
