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

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "./../StrategyBase.sol";

import "../../../third_party/uniswap/IWETH.sol";
import "./pipelines/LinearPipeline.sol";
import "./pipes/UnwrappingPipe.sol";
import "./pipes/AaveWethPipe.sol";
import "./pipes/MaiCamWMaticPipe.sol";
import "./pipes/MaiStablecoinCollateralPipe.sol";
import "./pipes/MaiStablecoinBorrowPipe.sol";
import "./pipes/BalVaultPipe.sol";

/// @title AAVE->MAI->BAL Multi Strategy
/// @author belbix, bogdoslav
contract AaveMaiBalStrategyBase is StrategyBase, LinearPipeline {
    using SafeMath for uint256;
    /// @notice Strategy type for statistical purposes
    string public constant override STRATEGY_NAME = "AaveMaiBalStrategyBase";
    /// @notice Version of the contract
    /// @dev Should be incremented when contract changed
    string public constant VERSION = "1.0.0";
    /// @dev Placeholder, for non full buyback need to implement liquidation
    uint256 private constant _BUY_BACK_RATIO = 10000;

    /// @dev Assets should reflect underlying tokens for investing
    address[] private _assets;

    address public constant WMATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;

    //TODO move to constructor

    // using structs to avoid "stack to deep" compiler error

    AaveWethPipeData aaveWethPipeData = AaveWethPipeData({
    wethGateway : 0xbEadf48d62aCC944a06EEaE0A9054A90E5A7dc97, // for MATIC deposits
    pool : 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf, // LendingPool
    lpToken : 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4  // Aave Matic Market WMATIC (amWMATIC)
    });

    MaiCamWMaticPipeData maiCamWMaticPipeData = MaiCamWMaticPipeData({
    sourceToken : 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4, // Aave Matic Market WMATIC (amWMATIC)
    lpToken : 0x7068Ea5255cb05931EFa8026Bd04b18F3DeB8b0B  // Compounding Aave Market Matic (camWMATIC)
    });

    MaiStablecoinCollateralPipeData maiStablecoinCollateralPipeData = MaiStablecoinCollateralPipeData({
    sourceToken : 0x7068Ea5255cb05931EFa8026Bd04b18F3DeB8b0B, // Compounding Aave Market Matic (camWMATIC)
    stablecoin : 0x88d84a85A87ED12B8f098e8953B322fF789fCD1a, // camWMATIC MAI Vault (cMVT)
    vaultID : 0                                           // have to initialize later
    });

    MaiStablecoinBorrowPipeData maiStablecoinBorrowPipeData = MaiStablecoinBorrowPipeData({
    stablecoin : 0x88d84a85A87ED12B8f098e8953B322fF789fCD1a, // camWMATIC MAI Vault (cMVT)
    vaultID : 0, // have to initialize later
    borrowedToken : 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1, // miMATIC (MAI)
    // https://docs.mai.finance/borrowing-incentives
    minPercentage : 240, // 135 - liquidation, 135+25=160 - minimum for incentives
    maxPercentage : 280, // 135+270=405 max percentage for incentives
    targetPercentage : 260
    });

    BalVaultPipeData balVaultPipeData = BalVaultPipeData({
    sourceToken : 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1, // miMATIC (MAI)
    vault : 0xBA12222222228d8Ba445958a75a0704d566BF2C8, // BalancerVault
    poolID : 0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012, // StablePool
    tokenIndex : 2,
    lpToken : 0x06Df3b2bbB68adc8B0e302443692037ED9f91b42  // Balancer Polygon Stable Pool (BPSP)
    });

    address constant maiRewardToken = 0x580A84C73811E1839F75d86d75d88cCa0c241fF4; // Qi Dao (QI)
    address constant balancerRewardToken = 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3; // BAL


    /// @notice Contract constructor
    constructor(
        address _controller,
        address _underlying,
        address _vault,
        address[] memory __rewardTokens,
        address[] memory __assets
    ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO)
    {
        require(_underlying == WMATIC, "MS: underlying must be WMATIC");
        _assets = __assets;

        //TODO check if there is some other reward tokens
        //    _rewardTokens.push(WMATIC); // AAVE reward should be consumed by MAI
        _rewardTokens.push(maiRewardToken);
        _rewardTokens.push(balancerRewardToken);

        // Build pipeline
        UnwrappingPipe unwrappingPipe = new UnwrappingPipe();
        segments.push(PipeSegment(unwrappingPipe, unwrappingPipe.create(WMATIC)));

        AaveWethPipe aaveWethPipe = new AaveWethPipe();
        segments.push(PipeSegment(aaveWethPipe, aaveWethPipe.create(aaveWethPipeData)));

        MaiCamWMaticPipe maiCamWMaticPipe = new MaiCamWMaticPipe();
        segments.push(PipeSegment(maiCamWMaticPipe, maiCamWMaticPipe.create(maiCamWMaticPipeData)));

        MaiStablecoinCollateralPipe maiStablecoinCollateralPipe = new MaiStablecoinCollateralPipe();
        (,uint256 vaultID) = maiStablecoinCollateralPipe.createNewVault(maiStablecoinCollateralPipeData.stablecoin);
        maiStablecoinCollateralPipeData.vaultID = vaultID;
        segments.push(PipeSegment(maiStablecoinCollateralPipe, maiStablecoinCollateralPipe.create(maiStablecoinCollateralPipeData)));

        maiStablecoinBorrowPipeData.vaultID = vaultID;
        MaiStablecoinBorrowPipe maiStablecoinBorrowPipe = new MaiStablecoinBorrowPipe();
        segments.push(PipeSegment(maiStablecoinBorrowPipe, maiStablecoinBorrowPipe.create(maiStablecoinBorrowPipeData)));

    }

    /// @dev Stub function for Strategy Base implementation
    function rewardPoolBalance() public override pure returns (uint256 bal) {
        bal = 0;
    }

    /// @dev Stub function for Strategy Base implementation
    function doHardWork() external onlyNotPausedInvesting override restricted {
        // withdrawAndClaimFromPool(0);
        //emergencyWithdrawFromPool();
        liquidateReward();
        rebalanceAllPipes();
    }

    function _balance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// @dev Stub function for Strategy Base implementation
    function depositToPool(uint256 underlyingAmount) internal override {
        pumpIn(underlyingAmount, 0);
    }

    /// @dev Stub function for Strategy Base implementation
    function withdrawAndClaimFromPool(uint256 underlyingAmount) internal override {
        pumpOut(underlyingAmount, 0);
    }

    /// @dev Stub function for Strategy Base implementation
    function emergencyWithdrawFromPool() internal override {
        //noop
    }

    /// @dev Stub function for Strategy Base implementation
    //slither-disable-next-line dead-code
    function liquidateReward() internal override {
        liquidateRewardDefault();
    }

    /// @dev Stub function for Strategy Base implementation
    function readyToClaim() external pure override returns (uint256[] memory) {
        uint256[] memory toClaim = new uint256[](1);
        return toClaim;
    }

    /// @dev Stub function for Strategy Base implementation
    function poolTotalAmount() external override returns (uint256) {
        return calculator.getTotalAmountOut(0);
    }

    function assets() external view override returns (address[] memory) {
        return _assets;
    }

    function platform() external pure override returns (Platform) {
        return Platform.UNKNOWN;
        //TODO What platform we have to use?
    }

}
