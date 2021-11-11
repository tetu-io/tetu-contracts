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

contract StrategyAaveMaiBal is AaveMaiBalStrategyBase {

    address[] private __rewardTokens = [ // rewardTokens
        0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270, // WMATIC on AAVE
        0x580A84C73811E1839F75d86d75d88cCa0c241fF4, // Qi Dao (QI)
        0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3  // BAL
    ]; //TODO check for other

    constructor(
        address _controller,
        address _vault,
        address _underlying
    ) AaveMaiBalStrategyBase(_controller, _underlying, _vault, new address[](0),
        0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270 //WMATIC,
    ) {

        address QI        = 0x580A84C73811E1839F75d86d75d88cCa0c241fF4;
        address BAL       = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;
        address amWMATIC  = 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4; // Aave Matic Market WMATIC (amWMATIC)
        address camWMATIC = 0x7068Ea5255cb05931EFa8026Bd04b18F3DeB8b0B; // Compounding Aave Market Matic (camWMATIC)
        address miMATIC   = 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1;

        // _assets.push(_token1); //TODO Do we have to add some underlying tokens here?

        _rewardTokens.push(WMATIC); // WMATIC on AAVE;
        _rewardTokens.push(QI);     // Qi Dao (QI) on MAI
        _rewardTokens.push(BAL);    // BAL on Balancer

        // Pipes data
        AaveWethPipeData memory aaveWethPipeData = AaveWethPipeData({
            wethGateway : 0xbEadf48d62aCC944a06EEaE0A9054A90E5A7dc97, // for MATIC deposits
            pool : 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf,        // LendingPool
            lpToken : amWMATIC,
            rewardToken: WMATIC
        });

        MaiCamWMaticPipeData memory maiCamWMaticPipeData = MaiCamWMaticPipeData({
            sourceToken : amWMATIC, // Aave Matic Market WMATIC (amWMATIC)
            lpToken : camWMATIC,
            rewardToken: QI
        });

        MaiStablecoinPipeData memory maiStablecoinPipeData = MaiStablecoinPipeData({
            sourceToken : camWMATIC, // Compounding Aave Market Matic (camWMATIC)
            stablecoin : 0x88d84a85A87ED12B8f098e8953B322fF789fCD1a,  // camWMATIC MAI Vault (cMVT)
            borrowToken : miMATIC,
            // https://docs.mai.finance/borrowing-incentives
            // 135 - liquidation, 135+25=160 - minimum for incentives
            // 135+270=405 max percentage for incentives
            targetPercentage : 200,
            maxImbalance : 10,
            rewardToken: QI
        });

        BalVaultPipeData memory balVaultPipeData = BalVaultPipeData({
            sourceToken : miMATIC,
            vault : 0xBA12222222228d8Ba445958a75a0704d566BF2C8, // BalancerVault
            poolID : 0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012, // StablePool
            tokenIndex : 2,
            lpToken : 0x06Df3b2bbB68adc8B0e302443692037ED9f91b42, // Balancer Polygon Stable Pool (BPSP)
            rewardToken: BAL   // BAL
        });

        // Build pipeline
        addPipe(new UnwrappingPipe(WMATIC));
        addPipe(new AaveWethPipe(aaveWethPipeData));
        addPipe(new MaiCamWMaticPipe(maiCamWMaticPipeData));
        addPipe(new MaiStablecoinPipe(maiStablecoinPipeData));
        addPipe(new BalVaultPipe(balVaultPipeData));

        console.log('StrategyAaveMaiBal Initialized');

    }

}
