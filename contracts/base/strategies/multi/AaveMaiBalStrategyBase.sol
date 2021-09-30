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

import "./../StrategyBase.sol";

import "./../connectors/AaveConnector.sol";
import "./../connectors/BalancerConnector.sol";
import "./../connectors/MaiConnector.sol";

/// @title AAVE->MAI->BAL Multi Strategy
/// @author belbix, bogdoslav
contract AaveMaiBalStrategyBase is StrategyBase {

  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "AaveMaiBalStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;
  /// @dev Assets should reflect underlying tokens for investing
  address[] private _assets;

  /// @notice Contract constructor
  constructor(
    address _controller,
    address _underlying,
    address _vault,
    address[] memory __rewardTokens,
    address[] memory __assets
  ) StrategyBase(_controller, _underlying, _vault, __rewardTokens, _BUY_BACK_RATIO) {
    _assets = __assets;

//    TODO - MAI: create camMATIC vault
//    https://polygonscan.com/tx/0x3f69c39b4ff0f3280d4277e0cc82d9dba3ff384a2ddad5890eb0960d55019dc2
//    contract erc20QiStablecoin(camWMATIC MAI Vault (cMVT)) 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
//    Function: createVault()

  }

  /// @dev Stub function for Strategy Base implementation
  function rewardPoolBalance() public override pure returns (uint256 bal) {
    bal = 0;
  }

  /// @dev Stub function for Strategy Base implementation
  function doHardWork() external onlyNotPausedInvesting override restricted {
    // call empty functions for getting 100% test coverage
    withdrawAndClaimFromPool(0);
    emergencyWithdrawFromPool();
    liquidateReward();
  }

  /// @dev Stub function for Strategy Base implementation
  function depositToPool(uint256 amount) internal override {
//  TODO - AAVE: deposit MATIC -> amMATIC {WMATIC rewards}
//  https://polygonscan.com/tx/0xab73bb28961fcee75cb5865c8cad0ff1aa7235461e8505dc9acea50078b1b12c
//  contract WETHGateway 0xbeadf48d62acc944a06eeae0a9054a90e5a7dc97
//  Function: depositETH(address lendingPool, address onBehalfOf, uint16 referralCode)
//
//
//  TODO - MAI: approve, enter yield deposit amMATIC to camMATIC
//  https://polygonscan.com/tx/0xc48fd433ef7145089daabed2dedd98f1c4598a8f50d7f7644dc2b91a7d41aad4
//  Contract 0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4 (Aave: amWMATIC Token)
//  Function: approve(address spender, uint256 rawAmount)
//  https://polygonscan.com/tx/0xfb7358d4bb2ec1cbd59b83e5e18705ac87d2c07166b328694da2b28115e7c6af
//  Contract camWMATIC 0x7068ea5255cb05931efa8026bd04b18f3deb8b0b
//  Function: enter(uint256 _amount)
//
//  TODO - MAI: approve, deposit camMATIC to collateral
//  https://polygonscan.com/tx/0x9f3040c242b164a4d28de2240c92375e59e17c90d24a584e7879d1b39a73a8ba
//  Contract (camWMATIC) 0x7068ea5255cb05931efa8026bd04b18f3deb8b0b
//  Function: approve(address spender, uint256 amount)
//  https://polygonscan.com/tx/0x79c84484e88d71783272e994ababc5fc133cb91239ecc3e688fcf4668f2fd323
//  Contract erc20QiStablecoin(camWMATIC MAI Vault (cMVT)) 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
//  Function: depositCollateral(uint256 vaultID 0x53e, uint256 amount)
//
//  TODO - MAI: borrow MAI (miMATIC) 33%  {QI airdrop}
//  https://polygonscan.com/tx/0x61a10463ecd073c6d9e67a33d6c29c14909916bfbf076d870840d962516763da
//  Contract 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
//  Function: borrowToken(uint256 vaultID 0x53e, uint256 amount) //TODO how to calc right amount?
//
//  TODO - BAL: approve, join pool deposit MAI to USDC-DAI-MAI-USDT pool to BPSP https://polygonscan.com/token/0x06df3b2bbb68adc8b0e302443692037ed9f91b42
//  https://polygonscan.com/tx/0x1793ae9eded0050f3b74a79e77dfad3a5db7f40a7a148b2373450802dbab220d
//  Contract 0xa3fa99a148fa48d14ed51d610c367c61876997f1 (Qi DAO: miMATIC Token)
//  Function: approve(address spender, uint256 amount)
//  https://polygonscan.com/tx/0x201dbe56a9843bc2a64d327fa0d2a9b81957af52681da6d85b4a3e17a64bf3dd
//  https://dashboard.tenderly.co/tx/polygon/0x201dbe56a9843bc2a64d327fa0d2a9b81957af52681da6d85b4a3e17a64bf3dd
//  Contract 0xba12222222228d8ba445958a75a0704d566bf2c8 (Balancer V2)
//  Function: joinPool(  bytes32 poolId,  address sender,  address recipient, JoinPoolRequest memory request)

  }

  /// @dev Stub function for Strategy Base implementation
  function withdrawAndClaimFromPool(uint256 amount) internal override {
    //noop
  }

  /// @dev Stub function for Strategy Base implementation
  function emergencyWithdrawFromPool() internal override {
    //noop
  }

  /// @dev Stub function for Strategy Base implementation
  //slither-disable-next-line dead-code
  function liquidateReward() internal override {
    // noop
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
