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

    uint16 private constant _maiCollateralToDebtTargetPercentage = 200;
    uint16 private constant _maxTargetPercentageImbalance        = 10;

    address private constant _WMATIC    = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    address private constant _amWMATIC  = 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4; // Aave Matic Market WMATIC (amWMATIC)
    address private constant _camWMATIC = 0x7068Ea5255cb05931EFa8026Bd04b18F3DeB8b0B; // Compounding Aave Market Matic (camWMATIC)

    address private constant _AAVE      = 0xD6DF932A45C0f255f85145f286eA0b292B21C90B;
    address private constant _amAAVE    = 0x1d2a0E5EC8E5bBDCA5CB219e649B565d8e5c3360; // Aave Matic Market AAVE (amAAVE)
    address private constant _camAAVE   = 0xeA4040B21cb68afb94889cB60834b13427CFc4EB; // Compounding Aave Market AAVE (camAAVE)

    address private constant _miMATIC   = 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1;
    address private constant _QI        = 0x580A84C73811E1839F75d86d75d88cCa0c241fF4; // MAI reward token
    address private constant _BAL       = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3;

    address private constant _AAVE_POOL = 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf;

    MaiStablecoinPipe private _maiStablecoinPipe;

    address[] private _rewardTokensArray = [_WMATIC, _QI, _BAL];

    constructor(
        address _controller,
        address _vault,
        address _underlying
    ) AaveMaiBalStrategyBase(_controller, _underlying, _vault, _rewardTokensArray, _WMATIC
    ) {
        // Pipes data
        address amToken;
        address camToken;
        address stablecoin;

        if (_underlying == _WMATIC) {
            amToken    = _amWMATIC;
            camToken   = _camWMATIC;
            stablecoin = 0x88d84a85A87ED12B8f098e8953B322fF789fCD1a;  // camWMATIC MAI Vault (cMVT)

            AaveWethPipeData memory aaveWethPipeData = AaveWethPipeData({
                wethGateway : 0xbEadf48d62aCC944a06EEaE0A9054A90E5A7dc97, // for MATIC deposits
                pool : _AAVE_POOL,        // LendingPool
                lpToken : amToken,
                rewardToken: _WMATIC
            });

            addPipe(new UnwrappingPipe(_WMATIC));
            addPipe(new AaveWethPipe(aaveWethPipeData));

        } else if (_underlying == _AAVE) { // AAVE underlying

            amToken    = _amAAVE;
            camToken   = _camAAVE;
            stablecoin = 0x578375c3af7d61586c2C3A7BA87d2eEd640EFA40; // camAAVE MAI Vault (camAMVT)

            AaveAmPipeData memory aaveAmPipeData = AaveAmPipeData({
                pool        : _AAVE_POOL,
                sourceToken : _underlying,
                lpToken     : amToken,
                rewardToken : _WMATIC
            });

            addPipe(new NoopPipe(_underlying)); // add no operation pipe to preserve pipes index for tests
            addPipe(new AaveAmPipe(aaveAmPipeData));

        } else revert('AMB: Underlying should be WMATIC or AAVE');

        MaiCamTokenPipeData memory maiCamTokenPipeData = MaiCamTokenPipeData({
            sourceToken : amToken,
            lpToken     : camToken,
            rewardToken : _QI
        });

        MaiStablecoinPipeData memory maiStablecoinPipeData = MaiStablecoinPipeData({
            sourceToken : camToken,
            stablecoin  : stablecoin,
            borrowToken : _miMATIC,
            // https://docs.mai.finance/borrowing-incentives
            // 135 - liquidation, 135+25=160 - minimum for incentives
            // 135+270=405 max percentage for incentives
            targetPercentage : _maiCollateralToDebtTargetPercentage,
            maxImbalance     : _maxTargetPercentageImbalance, // max targetPercentage deviation (+/-) to call rebalance
            rewardToken      : _QI
        });

        BalVaultPipeData memory balVaultPipeData = BalVaultPipeData({
            sourceToken : _miMATIC,
            vault : 0xBA12222222228d8Ba445958a75a0704d566BF2C8, // BalancerVault
            poolID : 0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012, // StablePool
            tokenIndex : 2,
            lpToken : 0x06Df3b2bbB68adc8B0e302443692037ED9f91b42, // Balancer Polygon Stable Pool (BPSP)
            rewardToken: _BAL
        });

        addPipe(new MaiCamTokenPipe(maiCamTokenPipeData));
        _maiStablecoinPipe = new MaiStablecoinPipe(maiStablecoinPipeData);
        addPipe(_maiStablecoinPipe);
        addPipe(new BalVaultPipe(balVaultPipeData));

    console.log('StrategyAaveMaiBal Initialized');
    }

    /// @dev Sets targetPercentage for MaiStablecoinPipe
    /// @param _targetPercentage - target collateral to debt percentage
    function setTargetPercentage(uint256 _targetPercentage) onlyControllerOrGovernance external {
        _maiStablecoinPipe.setTargetPercentage(_targetPercentage);
        rebalanceAllPipes();
    }

    /// @dev Gets targetPercentage of MaiStablecoinPipe
    /// @return collateral to debt percentage
    function targetPercentage() external view returns (uint256) {
        return _maiStablecoinPipe.targetPercentage();
    }

}
