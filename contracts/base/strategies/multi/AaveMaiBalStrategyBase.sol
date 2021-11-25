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
import "./pipes/MaiStablecoinPipe.sol";
import "./pipes/BalVaultPipe.sol";

/// @title AAVE->MAI->BAL Multi Strategy
/// @author belbix, bogdoslav
contract AaveMaiBalStrategyBase is StrategyBase, LinearPipeline {
    using SafeERC20 for IERC20;

    /// @notice Strategy type for statistical purposes
    string public constant override STRATEGY_NAME = "AaveMaiBalStrategyBase";
    /// @notice Version of the contract
    /// @dev Should be incremented when contract changed
    string public constant VERSION = "1.0.0";
    /// @dev Placeholder, for non full buyback need to implement liquidation
    uint256 private constant _BUY_BACK_RATIO = 10000;

    /// @dev Assets should reflect underlying tokens for investing
    address[] private _assets;

    // cached total amount in underlying tokens, updated after each deposit, withdraw and hardwork
    uint256 private _totalAmount = 0;

    address public WMATIC;

    /// @notice Contract constructor
    constructor(
        address _controller,
        address _underlyingToken,
        address _vault,
        address[] memory __rewardTokens,
        address _WMATIC
    ) StrategyBase(_controller, _underlyingToken, _vault, __rewardTokens, _BUY_BACK_RATIO)
    LinearPipeline(_underlyingToken)
    {
        WMATIC = _WMATIC;
        require(_underlyingToken == _WMATIC, "MS: underlying must be WMATIC");
        _rewardTokens = __rewardTokens;
    }


    /// @dev Returns reward pool balance
    function rewardPoolBalance() public override view returns (uint256 bal) {
        return _totalAmount;
    }

    /// @dev HardWork function for Strategy Base implementation
    function doHardWork() external onlyNotPausedInvesting override restricted {
        console.log('### doHardWork');
        uint256 balance = IERC20(_underlyingToken).balanceOf(address(this));
        if (balance > 0) {
            pumpIn(balance);
        }
        rebalanceAllPipes();
        claimFromAllPipes();
        console.log('_rewardTokens.length', _rewardTokens.length);
        //TODO remove balance logs
        uint256 balanceWMATIC = IERC20(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270).balanceOf(address(this));
        console.log('balanceWMATIC', balanceWMATIC);
        uint256 balanceQI = IERC20(0x580A84C73811E1839F75d86d75d88cCa0c241fF4).balanceOf(address(this));
        console.log('balanceQI', balanceQI);
        uint256 balanceBAL = IERC20(0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3).balanceOf(address(this));
        console.log('balanceBAL', balanceBAL);
        liquidateReward();
        _totalAmount = calculator.getTotalAmountOut();
        console.log('doHardWork _totalAmount', _totalAmount);
    }

    /// @dev Stub function for Strategy Base implementation
    function depositToPool(uint256 underlyingAmount) internal override {
        pumpIn(underlyingAmount);
        _totalAmount = calculator.getTotalAmountOut();
        console.log('depositToPool _totalAmount', _totalAmount);
    }

    /// @dev Function to withdraw from pool
    function withdrawAndClaimFromPool(uint256 underlyingAmount) internal override {
        console.log('withdrawAndClaimFromPool underlyingAmount', underlyingAmount);
        claimFromAllPipes();
        liquidateReward();
        uint256 amountOut = pumpOutSource(underlyingAmount, 0);
        console.log('amountOut', amountOut);
        uint256 underlyingBalance = IERC20(_underlyingToken).balanceOf(address(this));
        console.log('$ underlyingBalance', underlyingBalance);
        _totalAmount = calculator.getTotalAmountOut();
        console.log('withdrawAndClaimFromPool _totalAmount', _totalAmount);
    }

    /// @dev Emergency withdraws all most underlying from the pool
    function emergencyWithdrawFromPool() internal override {
        pumpOut(getMostUnderlyingBalance(), 0);
    }

    /// @dev Liquidate all reward tokens
    //slither-disable-next-line dead-code
    function liquidateReward() internal override {
        liquidateRewardDefault();
    }

    /// @dev Returns how much tokens are ready to claim
    function readyToClaim() external view override returns (uint256[] memory) {
        uint256 len = _rewardTokens.length;
        uint256[] memory toClaim = new uint256[](len);
        return toClaim;
    }

    /// @dev Returns pool total amount
    function poolTotalAmount() external pure override returns (uint256) {
        return 0;
    }

    /// @dev Returns assets array
    function assets() external view override returns (address[] memory) {
        return _assets;
    }

    /// @dev Returns platform index
    function platform() external pure override returns (Platform) {
        return Platform.AAVE_MAI_BAL;
    }

    /// @notice Controller can claim coins that are somehow transferred into the contract
    ///         Note that they cannot come in take away coins that are used and defined in the strategy itself
    /// @param recipient Recipient address
    /// @param token Token address
    function salvageFromPipeline(address recipient, address token)
    external onlyControllerOrGovernance {
        salvageFromAllPipes(recipient, token);
        // transfers token to this contract
    }

}
