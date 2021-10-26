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
    wethGateway      : 0xbEadf48d62aCC944a06EEaE0A9054A90E5A7dc97, // for MATIC deposits
    pool             : 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf, // LendingPool
    lpToken          : 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4  // Aave Matic Market WMATIC (amWMATIC)
  });

  MaiCamWMaticPipeData maiCamWMaticPipeData = MaiCamWMaticPipeData({
    sourceToken: 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4,
    lpToken    : 0x7068Ea5255cb05931EFa8026Bd04b18F3DeB8b0B
  });


//
//  MaiData mai = MaiData({
//    vault            : 0x88d84a85A87ED12B8f098e8953B322fF789fCD1a, // camWMATIC MAI Vault (cMVT)
//    sourceToken      : 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4, // Aave Matic Market WMATIC (amWMATIC)
//    lpToken          : 0x7068Ea5255cb05931EFa8026Bd04b18F3DeB8b0B, // Compounding Aave Market Matic (camWMATIC)
//    borrowPercentage : 50,
//    borrowToken      : 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1, // miMATIC/MAI Token
//    rewardToken      : 0x580A84C73811E1839F75d86d75d88cCa0c241fF4,  // QI/MAI Token
//    // https://docs.mai.finance/borrowing-incentives
//    minPercentage    : 240, // 135 - liquidation, 135+25=160 - minimum for incentives
//    maxPercentage    : 280, // 135+270=405 max percentage for incentives
//    targetPercentage : 260
//  });
//
//  BalancerData balancer = BalancerData({
//    vault            : 0xBA12222222228d8Ba445958a75a0704d566BF2C8,
//    sourceToken      : 0xa3Fa99A148fA48D14Ed51d610c367C61876997F1, // miMATIC/MAI Token
//    poolID           : 0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012,
//    tokenIndex       : 2,
//    lpToken          : 0x06Df3b2bbB68adc8B0e302443692037ED9f91b42, // Balancer Polygon Stable Pool (BPSP)
//    rewardToken      : 0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3 // BAL
//  });

  /// @notice Contract constructor
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address[] memory __assets
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO)
  {
    require(_underlying==WMATIC, "MS: underlying must be WMATIC" );
    _assets = __assets;

//    _maiCreateVault(); // ERC721Enumerable NFT token issued

    //TODO check if there is some other reward tokens
    // _rewardTokens.push(WMATIC); // AAVE reward should be consumed by MAI
//    _rewardTokens.push(mai.rewardToken);
//    _rewardTokens.push(balancer.rewardToken);

    // Build pipeline
    UnwrappingPipe unwrappingPipe = new UnwrappingPipe();
    segments.push( PipeSegment(unwrappingPipe, unwrappingPipe.create(WMATIC)) );

    AaveWethPipe aaveWethPipe = new AaveWethPipe();
    segments.push( PipeSegment(aaveWethPipe, aaveWethPipe.create(aaveWethPipeData)) );

    MaiCamWMaticPipe maiCamWMaticPipe = new MaiCamWMaticPipe();
    segments.push( PipeSegment(maiCamWMaticPipe, maiCamWMaticPipe.create(maiCamWMaticPipeData)) );
  }

  /// @dev Stub function for Strategy Base implementation
  function rewardPoolBalance() public override pure returns (uint256 bal) {
    bal = 0;
  }

  /// @dev Stub function for Strategy Base implementation
  function doHardWork() external onlyNotPausedInvesting override restricted {
    //reBalance();
    // withdrawAndClaimFromPool(0);
    //emergencyWithdrawFromPool();
    //_maiGetPaid(); //TODO do we need to call this?
    liquidateReward();

    rebalanceAllPipes();
  }

  function _balance(address token) internal view returns (uint256) {
    return IERC20(token).balanceOf(address(this));
  }

 /* function reBalance(uint256 target) public {
    // Stay between 25% and 270% above the liquidation ratio to receive QI token airdrop.
    uint256 current = 0; //TODO !!!
    if (target==current) return;

    if (target>current) {
      // borrow
      uint256 toBorrow = target.sub(current);
      uint256 maiBorrowAmount = toBorrow; //TODO !!!
      _maiBorrowToken(maiBorrowAmount);
      _balancerJoinPool(maiBorrowAmount);

    } else {
      // repay
      uint256 toRepay = current.sub(target);
      uint256 exitAmount = _convertUnderlyingToDeepUnderlying(toRepay);
      _balancerExitPool(exitAmount);
      uint256 repayAmount = _balance(mai.borrowToken);
      _maiRepayToken(repayAmount);
    }
  }*/

  /// @dev Stub function for Strategy Base implementation
  function depositToPool(uint256 underlyingAmount) internal override {
//    require(_underlyingToken==WMATIC, _UNDERLYING_MUST_BE_WMATIC );  //TODO extend for other tokens later
//
//    IWETH(WMATIC).withdraw(underlyingAmount); // Unwrap WMATIC
//    _aaveDepositETH(underlyingAmount);
//
//    uint256 aaveLPTokensAmount = _balance(aave.pool);
//    _maiEnterCamWMatic(aaveLPTokensAmount);
//
//    uint256 maiLPTokensAmount = _balance(mai.lpToken);
//    _maiDepositCollateral(maiLPTokensAmount);
//
//    reBalance(rewardPoolBalance()+ underlyingAmount);
  }

  function _convertUnderlyingToDeepUnderlying(uint256 underlyingAmount) internal pure returns (uint256) {
//    uint256 maiAmount = 0; //TODO !!!
//    uint256 exitAmount = _balancerGetExitAmount(maiAmount);
    return underlyingAmount; //TODO !!!
  }

  /// @dev Stub function for Strategy Base implementation
  function withdrawAndClaimFromPool(uint256 underlyingAmount) internal override {
//    reBalance(rewardPoolBalance()-underlyingAmount);
//    uint256 repayAmount = 0; //TODO !!!
//
//    uint256 camWMATICAmount = repayAmount.mul(100).div(mai.borrowPercentage);
//    _maiWithdrawCollateral(camWMATICAmount);
//
//    _maiLeaveCamWMatic(camWMATICAmount);
//
//    uint256 aaveLPTokenAmount = _balance(aave.lpToken);
//    _aaveWithdrawETH(aaveLPTokenAmount); // Withdraw MATIC from AAVE
//
//    IWETH(WMATIC).deposit{value:address(this).balance}(); // Wrap MATIC to WMATIC
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
  function poolTotalAmount() external pure override returns (uint256) {

    return 0; //TODO
  }

  function assets() external view override returns (address[] memory) {
    return _assets;
  }

  function platform() external pure override returns (Platform) {
    return Platform.UNKNOWN; //TODO What platform we have to use?
  }

}
