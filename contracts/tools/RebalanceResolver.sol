// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../base/interfaces/IController.sol";
import "../base/interfaces/IBookkeeper.sol";
import "../base/interfaces/ISmartVault.sol";
import "../base/interfaces/IStrategy.sol";
import "../base/interfaces/IStrategySplitter.sol";
import "../openzeppelin/Initializable.sol";
import "../base/governance/ControllableV2.sol";

contract RebalanceResolver is ControllableV2 {

  // --- CONSTANTS ---

  string public constant VERSION = "1.0.1";

  // --- VARIABLES ---

  address public owner;
  address public pendingOwner;
  uint public maxGas;

  mapping(address => bool) public operators;
  mapping(address => bool) public excludedVaults;
  uint public lastCall;

  // --- INIT ---

  function init(
    address controller_
  ) external initializer {
    ControllableV2.initializeControllable(controller_);

    owner = msg.sender;
    maxGas = 35 gwei;
    lastCall = block.timestamp;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "!owner");
    _;
  }

  // --- OWNER FUNCTIONS ---

  function offerOwnership(address value) external onlyOwner {
    pendingOwner = value;
  }

  function acceptOwnership() external {
    require(msg.sender == pendingOwner, "!pendingOwner");
    owner = pendingOwner;
    pendingOwner = address(0);
  }

  function setMaxGas(uint value) external onlyOwner {
    maxGas = value;
  }

  function changeOperatorStatus(address operator, bool status) external onlyOwner {
    operators[operator] = status;
  }

  function changeVaultExcludeStatus(address[] memory vaults, bool status) external onlyOwner {
    for (uint i; i < vaults.length; ++i) {
      excludedVaults[vaults[i]] = status;
    }
  }

  // --- MAIN LOGIC ---

  function isEligible(address vault) public view returns (bool eligible, address strategy) {
    strategy = ISmartVault(vault).strategy();

    eligible = ISmartVault(vault).active()
    && IStrategy(strategy).platform() == IStrategy.Platform.STRATEGY_SPLITTER
    && !IStrategy(strategy).pausedInvesting()
    && IStrategySplitter(strategy).needRebalance() > 0;
    if (eligible) {
      uint totalAssets = ISmartVault(vault).underlyingBalanceWithInvestment();
      uint strategyAssets = IStrategy(strategy).underlyingBalance();
      uint ratio = strategyAssets * 100 / totalAssets;
      eligible = ratio > 10;
    }
  }

  function call(address vault) external {
    require(operators[msg.sender], "!operator");

    (bool eligible, address strategy) = isEligible(vault);
    if (!eligible) {
      return;
    }

    try IStrategySplitter(strategy).rebalanceAll() {}  catch Error(string memory _err) {
      revert(string(abi.encodePacked("Rebalance error: 0x", _toAsciiString(strategy), " ", _err)));
    } catch (bytes memory _err) {
      revert(string(abi.encodePacked("Rebalance low-level error: 0x", _toAsciiString(strategy), " ", string(_err))));
    }

    lastCall = block.timestamp;
  }

  function maxGasAdjusted() public view returns (uint) {
    uint _lastCall = lastCall;
    _lastCall = _lastCall == 0 ? ControllableV2(address(this)).created() : _lastCall;
    uint _maxGas = maxGas;

    uint diff = block.timestamp - _lastCall;
    uint multiplier = diff * 100 / 1 days;
    return _maxGas + _maxGas * multiplier / 100;
  }

  function checker() external view returns (bool canExec, bytes memory execPayload) {
    if (tx.gasprice > maxGasAdjusted()) {
      return (false, abi.encodePacked("Too high gas: ", _toString(tx.gasprice / 1e9)));
    }

    IBookkeeper _bookkeeper = IBookkeeper(IController(_controller()).bookkeeper());
    uint vaultsLength = _bookkeeper.vaultsLength();
    address vaultForRebalance;
    for (uint i; i < vaultsLength; ++i) {
      address vault = _bookkeeper._vaults(i);
      (bool eligible,) = isEligible(vault);
      if (eligible) {
        vaultForRebalance = vault;
        break;
      }
    }
    if (vaultForRebalance == address(0)) {
      return (false, bytes("No ready splitters"));
    } else {
      return (true, abi.encodeWithSelector(RebalanceResolver.call.selector, vaultForRebalance));
    }
  }

  /// @dev Inspired by OraclizeAPI's implementation - MIT license
  ///      https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol
  function _toString(uint value) internal pure returns (string memory) {
    if (value == 0) {
      return "0";
    }
    uint temp = value;
    uint digits;
    while (temp != 0) {
      digits++;
      temp /= 10;
    }
    bytes memory buffer = new bytes(digits);
    while (value != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + uint(value % 10)));
      value /= 10;
    }
    return string(buffer);
  }

  function _toAsciiString(address x) internal pure returns (string memory) {
    bytes memory s = new bytes(40);
    for (uint i = 0; i < 20; i++) {
      bytes1 b = bytes1(uint8(uint(uint160(x)) / (2 ** (8 * (19 - i)))));
      bytes1 hi = bytes1(uint8(b) / 16);
      bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
      s[2 * i] = _char(hi);
      s[2 * i + 1] = _char(lo);
    }
    return string(s);
  }

  function _char(bytes1 b) internal pure returns (bytes1 c) {
    if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
    else return bytes1(uint8(b) + 0x57);
  }

}
