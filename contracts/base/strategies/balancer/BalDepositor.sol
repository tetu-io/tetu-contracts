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

import "../../SlotsLib.sol";
import "../../governance/ControllableV2.sol";
import "../../../openzeppelin/SafeERC20.sol";
import "../../../third_party/balancer/IBVault.sol";
import "../../../third_party/polygon/IRootChainManager.sol";
import "../../interface/ISmartVault.sol";
import "../../interface/IStrategy.sol";
import "../../../third_party/uniswap/IWETH.sol";

/// @title Cross chain depositor for BAL and WETH tokens to tetuBAL vault
/// @author belbix
contract BalDepositor is ControllableV2 {
  using SlotsLib for bytes32;
  using SafeERC20 for IERC20;

  // ----- CONSTANTS -------

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
  address public constant BAL = 0xba100000625a3754423978a60c9317c58a424e3D;
  address public constant BALANCER_VAULT = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
  bytes32 public constant BALANCER_BAL_WETH_ID = 0x5c6ee304399dbdb9c8ef030ab642b10820db8f56000200000000000000000014;
  address public constant BPT_BAL_WETH = 0x5c6Ee304399DBdB9C8Ef030aB642B10820DB8F56;
  address public constant POLYGON_BRIDGE = 0xA0c68C638235ee32657e8f720a23ceC1bFc77C77;
  address public constant POLYGON_BRIDGE_PREDICATE = 0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf;
  bytes32 internal constant _DESTINATION_VAULT_KEY = bytes32(uint256(keccak256("depositor.destination_vault")) - 1);
  bytes32 internal constant _ANOTHER_CHAIN_RECIPIENT_KEY = bytes32(uint256(keccak256("depositor.another_chain_recipient")) - 1);

  // ----- EVENTS -------

  event DestinationVaultChanged(address oldValue, address newValue);
  event AnotherChainRecipientChanged(address oldValue, address newValue);
  event Deposited(uint balAmount, uint wethAmount, uint bptAmount);
  event Claimed(uint balAmount);
  event EthReceived(address sender, uint amount);

  // ----- INITIALIZER -------

  function initialize(
    address controller_
  ) external initializer {
    ControllableV2.initializeControllable(controller_);

    IERC20(WETH).safeApprove(BALANCER_VAULT, type(uint).max);
    IERC20(BAL).safeApprove(BALANCER_VAULT, type(uint).max);
    IERC20(BAL).safeApprove(POLYGON_BRIDGE_PREDICATE, type(uint).max);
  }

  modifier onlyHardworkerOrGov() {
    require(IController(_controller()).isHardWorker(msg.sender)
      || _isGovernance(msg.sender), "Not hardworker or gov");
    _;
  }

  modifier onlyGov() {
    require(_isGovernance(msg.sender), "Not gov");
    _;
  }

  // ----- GOV ACTIONS -------

  function setDestinationVault(address value_) external onlyGov {
    address oldValue = _DESTINATION_VAULT_KEY.getAddress();
    IERC20(BPT_BAL_WETH).safeApprove(oldValue, 0);
    emit DestinationVaultChanged(oldValue, value_);
    _DESTINATION_VAULT_KEY.set(value_);
    IERC20(BPT_BAL_WETH).safeApprove(value_, 0);
    IERC20(BPT_BAL_WETH).safeApprove(value_, type(uint).max);
  }

  function setAnotherChainRecipient(address value_) external onlyGov {
    address oldValue = _ANOTHER_CHAIN_RECIPIENT_KEY.getAddress();
    emit AnotherChainRecipientChanged(oldValue, value_);
    _ANOTHER_CHAIN_RECIPIENT_KEY.set(value_);
  }

  // ----- HARDWORKER ACTIONS -------

  function depositBridgedAssets(bytes calldata bridgeData) external onlyHardworkerOrGov {

    if (bridgeData.length != 0) {
      IRootChainManager(POLYGON_BRIDGE).exit(bridgeData);
    }

    if (address(this).balance != 0) {
      IWETH(WETH).deposit{value : address(this).balance}();
    }

    uint balBalance = IERC20(BAL).balanceOf(address(this));
    uint wethBalance = IERC20(WETH).balanceOf(address(this));

    if (balBalance == 0 || wethBalance == 0) {
      // not enough balance
      return;
    }

    uint[] memory maxAmounts = new uint[](2);
    maxAmounts[0] = balBalance * 11 / 10;
    maxAmounts[1] = wethBalance * 11 / 10;

    uint[] memory amounts = new uint[](2);
    amounts[0] = balBalance;
    amounts[1] = wethBalance;

    IAsset[] memory _assets = new IAsset[](2);
    _assets[0] = IAsset(BAL);
    _assets[1] = IAsset(WETH);

    bytes memory userData = abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, amounts, 0);

    IBVault(BALANCER_VAULT).joinPool(
      BALANCER_BAL_WETH_ID,
      address(this),
      address(this),
      IBVault.JoinPoolRequest({
    assets : _assets,
    maxAmountsIn : maxAmounts,
    userData : userData,
    fromInternalBalance : false
    })
    );

    uint bptBalance = IERC20(BPT_BAL_WETH).balanceOf(address(this));

    ISmartVault(_DESTINATION_VAULT_KEY.getAddress()).depositAndInvest(bptBalance);
    emit Deposited(balBalance, wethBalance, bptBalance);
  }

  function claimAndMoveToAnotherChain() external onlyHardworkerOrGov {

    address strategy = ISmartVault(_DESTINATION_VAULT_KEY.getAddress()).strategy();
    uint balBalanceBefore = IERC20(BAL).balanceOf(address(this));

    IStrategy(strategy).doHardWork();

    uint balBalance = IERC20(BAL).balanceOf(address(this)) - balBalanceBefore;

    require(balBalance != 0, "Zero claim");

    bytes memory depositData = abi.encode(balBalance);
    IRootChainManager(POLYGON_BRIDGE).depositFor(
      _ANOTHER_CHAIN_RECIPIENT_KEY.getAddress(),
      BAL,
      depositData
    );
    emit Claimed(balBalance);
  }

  receive() external payable {
    emit EthReceived(msg.sender, msg.value);
  }

}
