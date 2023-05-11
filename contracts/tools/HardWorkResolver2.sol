// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../base/interfaces/ISmartVault.sol";
import "../base/interfaces/IStrategy.sol";
import "../openzeppelin/EnumerableSet.sol";
import "../base/governance/ControllableV2.sol";

contract HardWorkResolver2 is ControllableV2 {
  using EnumerableSet for EnumerableSet.AddressSet;

  // --- CONSTANTS ---

  string public constant VERSION = "1.0.0";
  uint public constant DELAY_RATE_DENOMINATOR = 100_000;

  // --- VARIABLES ---

  address public owner;
  address public pendingOwner;
  uint public delay;
  uint public maxGas;
  uint public maxHwPerCall;

  mapping(address => uint) internal _lastHW;
  mapping(address => uint) public delayRate;
  mapping(address => bool) public operators;
  mapping(address => bool) public excludedVaults;
  uint public lastHWCall;

  EnumerableSet.AddressSet internal vaults;

  // --- INIT ---

  function init(address controller_) external initializer {
    ControllableV2.initializeControllable(controller_);

    owner = msg.sender;
    delay = 1 days;
    maxGas = 35 gwei;
    maxHwPerCall = 5;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "!owner");
    _;
  }

  function allVaults() external view returns (address[] memory) {
    return vaults.values();
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

  function setDelay(uint value) external onlyOwner {
    delay = value;
  }

  function setMaxGas(uint value) external onlyOwner {
    maxGas = value;
  }

  function setMaxHwPerCall(uint value) external onlyOwner {
    maxHwPerCall = value;
  }

  function setDelayRate(address[] memory _vaults, uint value) external onlyOwner {
    for (uint i; i < _vaults.length; ++i) {
      delayRate[_vaults[i]] = value;
    }
  }

  function changeOperatorStatus(address operator, bool status) external onlyOwner {
    operators[operator] = status;
  }

  function changeVaultExcludeStatus(address[] memory _vaults, bool status) external onlyOwner {
    for (uint i; i < _vaults.length; ++i) {
      excludedVaults[_vaults[i]] = status;
    }
  }

  function changeVaultStatus(address vault, bool add) external {
    require(operators[msg.sender], "!operator");

    if (add) {
      require(vaults.add(vault), 'exist');
    } else {
      require(vaults.remove(vault), '!exist');
    }
  }

  // --- MAIN LOGIC ---

  function lastHW(address vault) public view returns (uint lastHardWorkTimestamp) {
    lastHardWorkTimestamp = _lastHW[vault];
  }

  function call(address[] memory _vaults) external returns (uint amountOfCalls){
    require(operators[msg.sender], "!operator");

    uint _delay = delay;
    uint _maxHwPerCall = maxHwPerCall;
    uint vaultsLength = _vaults.length;
    uint counter;
    for (uint i; i < vaultsLength; ++i) {
      address vault = _vaults[i];
      if (lastHW(vault) + _delay > block.timestamp) {
        continue;
      }

      address strategy = ISmartVault(vault).strategy();

      try IStrategy(strategy).doHardWork() {}  catch Error(string memory _err) {
        revert(string(abi.encodePacked("Vault error: 0x", _toAsciiString(vault), " ", _err)));
      } catch (bytes memory _err) {
        revert(string(abi.encodePacked("Vault low-level error: 0x", _toAsciiString(vault), " ", string(_err))));
      }
      _lastHW[vault] = block.timestamp;
      counter++;
      if (counter >= _maxHwPerCall) {
        break;
      }
    }

    lastHWCall = block.timestamp;
    return counter;
  }

  function maxGasAdjusted() public view returns (uint) {
    uint _maxGas = maxGas;

    uint diff = block.timestamp - lastHWCall;
    uint multiplier = diff * 100 / 1 days;
    return _maxGas + _maxGas * multiplier / 100;
  }

  function checker() external view returns (bool canExec, bytes memory execPayload) {
    if (tx.gasprice > maxGasAdjusted()) {
      return (false, abi.encodePacked("Too high gas: ", _toString(tx.gasprice / 1e9)));
    }

    uint _delay = delay;
    uint vaultsLength = vaults.length();
    address[] memory _vaults = new address[](vaultsLength);
    uint counter;
    for (uint i; i < vaultsLength; ++i) {
      address vault = vaults.at(i);
      if (!excludedVaults[vault]) {

        uint delayAdjusted = _delay;
        uint _delayRate = delayRate[vault];
        if (_delayRate != 0) {
          delayAdjusted = _delay * _delayRate / DELAY_RATE_DENOMINATOR;
        }

        if (lastHW(vault) + _delay < block.timestamp) {
          _vaults[i] = vault;
          counter++;
        }
      }
    }
    if (counter == 0) {
      return (false, bytes("No ready vaults"));
    } else {
      address[] memory vaultsResult = new address[](counter);
      uint j;
      for (uint i; i < vaultsLength; ++i) {
        if (_vaults[i] != address(0)) {
          vaultsResult[j] = _vaults[i];
          ++j;
        }
      }
      return (true, abi.encodeWithSelector(HardWorkResolver2.call.selector, vaultsResult));
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
