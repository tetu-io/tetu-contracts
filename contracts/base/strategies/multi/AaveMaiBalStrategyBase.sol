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

    /// @notice Contract constructor
    constructor(
        address _controller,
        address _underlying,
        address _vault,
        address[] memory __rewardTokens,
        AaveWethPipeData memory aaveWethPipeData,
        MaiCamWMaticPipeData memory maiCamWMaticPipeData,
        MaiStablecoinCollateralPipeData memory maiStablecoinCollateralPipeData,
        MaiStablecoinBorrowPipeData memory maiStablecoinBorrowPipeData,
        BalVaultPipeData memory balVaultPipeData
    ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO)
    {
        require(_underlying == WMATIC, "MS: underlying must be WMATIC");
        _rewardTokens = __rewardTokens;

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

        BalVaultPipe balVaultPipe = new BalVaultPipe();
        segments.push(PipeSegment(balVaultPipe, balVaultPipe.create(balVaultPipeData)));

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
        pumpOutSource(underlyingAmount, 0);
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
        uint256[] memory toClaim = new uint256[](1); //TODO
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
        return Platform.UNKNOWN; //TODO What platform we have to use?
    }

}
