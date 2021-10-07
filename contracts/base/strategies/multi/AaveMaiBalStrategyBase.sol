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
import "./../StrategyBase.sol";

import "../../../third_party/uniswap/IWETH.sol";
import "./connectors/AaveConnector.sol";
import "./connectors/MaiConnector.sol";
import "./connectors/BalancerConnector.sol";

/// @title AAVE->MAI->BAL Multi Strategy
/// @author belbix, bogdoslav
contract AaveMaiBalStrategyBase is StrategyBase, AaveWethConnector, MaiConnector {

  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "AaveMaiBalStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;
  string constant _UNDERLYING_MUST_BE_WMATIC = "MS: underlying must be WMATIC";

  /// @dev Assets should reflect underlying tokens for investing
  address[] private _assets;

  address constant WMATIC = 0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270;

  //TODO move to constructor
  address public constant aaveWethGatewayAddress = 0xbeadf48d62acc944a06eeae0a9054a90e5a7dc97; // for MATIC deposits
  address public constant aavePoolAddress        = 0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf; // LendingPool
  address public constant aaveLPTokenAddress     = 0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4; // Aave Matic Market WMATIC (amWMATIC)

  address public constant maiVaultAddress        = 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a; // camWMATIC MAI Vault (cMVT)
  address public constant maiLPTokenAddress      = 0x7068ea5255cb05931efa8026bd04b18f3deb8b0b; // Compounding Aave Market Matic (camWMATIC)
  uint256 public constant maiBorrowPercentage    = 33;
  address public constant maiBorrowToken         = 0xa3fa99a148fa48d14ed51d610c367c61876997f1; // miMATIC/MAI Token
  address public constant maiRewardToken         = 0x580a84c73811e1839f75d86d75d88cca0c241ff4; // QI/MAI Token

  address public constant balancerVaultAddress   = 0xba12222222228d8ba445958a75a0704d566bf2c8;
  uint256 public constant balancerPoolID         = 0x06df3b2bbb68adc8b0e302443692037ed9f91b42000000000000000000000012;
  uint256 public constant balancerTokenIndexAtPool = 2;
  address public constant balancerLPToken        = 0x06df3b2bbb68adc8b0e302443692037ed9f91b42; // Balancer Polygon Stable Pool (BPSP)
  address public constant balancerRewardToken    = 0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3; // BAL

  address public constant deepUnderlying         = balancerLPToken;

  /// @notice Contract constructor
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address[] memory __assets
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO)
    AaveWethConnector(aaveWethGatewayAddress, aavePoolAddress, aaveLPTokenAddress)
    MaiConnector(maiVaultAddress, aaveLPTokenAddress, maiLPTokenAddress, maiBorrowToken)
    BalancerConnector(balancerVaultAddress, maiBorrowToken, balancerPoolID, balancerTokenIndexAtPool)
  {
//    assert(_underlying==WMATIC, _UNDERLYING_MUST_BE_WMATIC ); //TODO extend for other tokens later
    _assets = __assets;

//    MAI: create camMATIC vault
//    https://polygonscan.com/tx/0x3f69c39b4ff0f3280d4277e0cc82d9dba3ff384a2ddad5890eb0960d55019dc2
//    contract erc20QiStablecoin(camWMATIC MAI Vault (cMVT)) 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
//    Function: createVault()
    _maiCreateVault(); // ERC721Enumerable NFT token issued

    rewardTokens = [maiRewardToken, balancerRewardToken]; //TODO check if there is some other reward tokens
  }

  /// @dev Stub function for Strategy Base implementation
  function rewardPoolBalance() public override pure returns (uint256 bal) {
    bal = 0;
  }

  /// @dev Stub function for Strategy Base implementation
  function doHardWork() external onlyNotPausedInvesting override restricted {
    // call empty functions for getting 100% test coverage
    //TODO claim AAVE rewards
    //TODO check erc20QiStablecoin Collateral to Debt Ratio checkCollateralPercentage: at 135 vault will be liquidated
    withdrawAndClaimFromPool(0);
    emergencyWithdrawFromPool();
    liquidateReward();
  }

  function _balance(address token) returns (uint256) {
    return IERC20(token).balanceOf(address(this));
  }

  /// @dev Stub function for Strategy Base implementation
  function depositToPool(uint256 amount) internal override {
//  AAVE: deposit MATIC -> amMATIC {WMATIC rewards}
//  https://polygonscan.com/tx/0xab73bb28961fcee75cb5865c8cad0ff1aa7235461e8505dc9acea50078b1b12c
//  contract WETHGateway 0xbeadf48d62acc944a06eeae0a9054a90e5a7dc97
//  Function: depositETH(address lendingPool, address onBehalfOf, uint16 referralCode)
    assert(underlying==WMATIC, _UNDERLYING_MUST_BE_WMATIC );  //TODO extend for other tokens later

    uint256 maiVaultID = _maiGetVaultID();

    IWETH(WMATIC).withdraw(amount); // Unwrap WMATIC
    _aaveDepositETH(amount);

//  MAI: approve, enter yield deposit amMATIC to camMATIC
//  https://polygonscan.com/tx/0xc48fd433ef7145089daabed2dedd98f1c4598a8f50d7f7644dc2b91a7d41aad4
//  Contract 0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4 (Aave: amWMATIC Token)
//  Function: approve(address spender, uint256 rawAmount)
//  https://polygonscan.com/tx/0xfb7358d4bb2ec1cbd59b83e5e18705ac87d2c07166b328694da2b28115e7c6af
//  Contract camWMATIC 0x7068ea5255cb05931efa8026bd04b18f3deb8b0b
//  Function: enter(uint256 _amount)

    uint256 aaveLPTokensAmount = _balance(aavePoolAddress);
    _maiEnterCamWMatic(aaveLPTokensAmount);

//  MAI: approve, deposit camMATIC to collateral
//  https://polygonscan.com/tx/0x9f3040c242b164a4d28de2240c92375e59e17c90d24a584e7879d1b39a73a8ba
//  Contract (camWMATIC) 0x7068ea5255cb05931efa8026bd04b18f3deb8b0b
//  Function: approve(address spender, uint256 amount)
//  https://polygonscan.com/tx/0x79c84484e88d71783272e994ababc5fc133cb91239ecc3e688fcf4668f2fd323
//  Contract erc20QiStablecoin(camWMATIC MAI Vault (cMVT)) 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
//  Function: depositCollateral(uint256 vaultID 0x53e, uint256 amount db037b6c4b33e8b)

    uint256 maiLPTokensAmount = _balance(maiLPTokenAddress);
    _maiDepositCollateral(maiLPTokensAmount);

//  MAI: borrow MAI (miMATIC) 33%  {QI airdrop}
//  https://polygonscan.com/tx/0x61a10463ecd073c6d9e67a33d6c29c14909916bfbf076d870840d962516763da
//  Contract erc20QiStablecoin(camWMATIC MAI Vault (cMVT)) 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
//  Function: borrowToken(uint256 vaultID 0x53e, uint256 amount 368a5a82c9a940e)

    //TODO calc borrow amount more precise (get max from contract, then mul to maiBorrowPercentage)
    uint256 maiBorrowAmount = maiLPTokensAmount.mul(maiBorrowPercentage).div(100);
    _maiBorrowToken(maiBorrowAmount);


//  BAL: approve, join pool deposit MAI to USDC-DAI-MAI-USDT pool to BPSP https://polygonscan.com/token/0x06df3b2bbb68adc8b0e302443692037ed9f91b42
//  https://polygonscan.com/tx/0x1793ae9eded0050f3b74a79e77dfad3a5db7f40a7a148b2373450802dbab220d
//  Contract 0xa3fa99a148fa48d14ed51d610c367c61876997f1 (Qi DAO: miMATIC Token)
//  Function: approve(address spender, uint256 amount)
//  https://polygonscan.com/tx/0x201dbe56a9843bc2a64d327fa0d2a9b81957af52681da6d85b4a3e17a64bf3dd
//  https://dashboard.tenderly.co/tx/polygon/0x201dbe56a9843bc2a64d327fa0d2a9b81957af52681da6d85b4a3e17a64bf3dd
//  Contract 0xba12222222228d8ba445958a75a0704d566bf2c8 (Balancer V2)
//  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)

    _balancerJoinPool(maiBorrowAmount);

  }

  /// @dev Stub function for Strategy Base implementation
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    //TODO convert amount (WMATIC) to deepUnderlying (BPSP)
    uint256 exitAmount = amount; //TODO !!!

    // BAL: withdraw miMATIC
    // https://polygonscan.com/tx/0xc114039567b12bc2128bfe54eab0e742620a4200587525ce512c489805966055
    // https://dashboard.tenderly.co/tx/polygon/0xc114039567b12bc2128bfe54eab0e742620a4200587525ce512c489805966055
    _balancerExitPool(exitAmount);

    // MAI: repay miMATIC/MAI (0.5% fee)
    // https://polygonscan.com/tx/0x81e483a29d3ec3b3265db7d013eeb97968233cfae2d3989bc325e8b24ebc6e0f
    uint256 repayAmount = _balance(maiBorrowToken);
    _maiRepayToken(repayAmount);

    // MAI: withdraw camWMATIC
    // https://polygonscan.com/tx/0xfcd83b5c444e537b6f569dac7ae6dd82cb011d80cb00d790f2e1814c8175d437
    uint256 maiWithdrawAmount = repayAmount.mul(100).div(maiBorrowPercentage);
    _maiWithdrawCollateral(maiWithdrawAmount);

    // MAI: withdraw amWMATIC
    // https://polygonscan.com/tx/0x72c13585c9c35f85b6fa70882f8bad80745689f09070df3eb1c54a8027c89f30
    _maiLeaveCamWMatic(maiWithdrawAmount);

    // AAVE: approve amWMATIC for AAVE
    // https://polygonscan.com/tx/0x4a82adcdd3fc296eb1945a3339d5785ecd2b6c50cbf6c960ab7dd4a367fae6bd
    // AAVE: withdraw MATIC
    // https://polygonscan.com/tx/0x517e48dc212f1980a5e79ec1d1f4e3360519596e7119a921916cc7122df3867c
    _aaveWithdrawETH(); // Withdraw MATIC from AAVE

    IWETH(WMATIC).deposit(amount); // Wrap MATIC to WMATIC

    //TODO add some checks?
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
    return 0;
  }

  /// @dev Stub function for Strategy Base implementation
  function poolWeeklyRewardsAmount() external pure override returns (uint256[] memory) {
    uint256[] memory rewards = new uint256[](1);
    rewards[0] = 0;
    return rewards;
  }

}
