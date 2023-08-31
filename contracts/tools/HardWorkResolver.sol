// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../base/interfaces/IController.sol";
import "../base/interfaces/IBookkeeper.sol";
import "../base/interfaces/ISmartVault.sol";
import "../base/interfaces/IStrategy.sol";
import "../base/interfaces/IStrategySplitter.sol";
import "../openzeppelin/Initializable.sol";
import "../base/governance/ControllableV2.sol";

contract HardWorkResolver is ControllableV2 {

  // --- CONSTANTS ---

  string public constant VERSION = "1.0.4";
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

  // --- INIT ---

  function init(
    address controller_
  ) external initializer {
    ControllableV2.initializeControllable(controller_);

    owner = msg.sender;
    delay = 1 days;
    maxGas = 35 gwei;
    maxHwPerCall = 3;
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

  function setDelay(uint value) external onlyOwner {
    delay = value;
  }

  function setMaxGas(uint value) external onlyOwner {
    maxGas = value;
  }

  function setMaxHwPerCall(uint value) external onlyOwner {
    maxHwPerCall = value;
  }

  function setDelayRate(address[] memory vaults, uint value) external onlyOwner {
    for (uint i; i < vaults.length; ++i) {
      delayRate[vaults[i]] = value;
    }
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

  function lastHW(address vault) public view returns (uint lastHardWorkTimestamp) {
    lastHardWorkTimestamp = 0;
    IBookkeeper bookkeeper = IBookkeeper(IController(_controller()).bookkeeper());
    address strategy = ISmartVault(vault).strategy();
    if (IStrategy(strategy).platform() == IStrategy.Platform.STRATEGY_SPLITTER) {
      address[] memory subStrategies = IStrategySplitter(strategy).allStrategies();
      for (uint i; i < subStrategies.length; ++i) {
        address subStrategy = subStrategies[i];
        if (IStrategy(subStrategy).pausedInvesting()) {
          continue;
        }
        uint time = bookkeeper.lastHardWork(subStrategy).time;
        if (lastHardWorkTimestamp < time) {
          lastHardWorkTimestamp = time;
        }
      }
    } else {
      lastHardWorkTimestamp = bookkeeper.lastHardWork(strategy).time;
    }
    uint localTime = _lastHW[vault];
    if (lastHardWorkTimestamp == 0 || lastHardWorkTimestamp < localTime) {
      lastHardWorkTimestamp = localTime;
    }
  }

  function call(address[] memory vaults) external returns (uint amountOfCalls){
    require(operators[msg.sender], "!operator");

    IController __controller = IController(_controller());
    uint _delay = delay;
    uint _maxHwPerCall = maxHwPerCall;
    uint vaultsLength = vaults.length;
    uint counter;
    for (uint i; i < vaultsLength; ++i) {
      address vault = vaults[i];
      if (
        !ISmartVault(vault).active()
      || lastHW(vault) + _delay > block.timestamp
      ) {
        continue;
      }

      address strategy = ISmartVault(vault).strategy();
      if (IStrategy(strategy).platform() == IStrategy.Platform.STRATEGY_SPLITTER) {
        address[] memory subStrategies = IStrategySplitter(strategy).allStrategies();
        for (uint j; j < subStrategies.length; ++j) {
          address subStrategy = subStrategies[j];
          if (IStrategy(subStrategy).pausedInvesting()) {
            continue;
          }
          try IStrategy(subStrategy).doHardWork() {}  catch Error(string memory _err) {
            revert(string(abi.encodePacked("Strategy error: 0x", _toAsciiString(subStrategy), " ", _err)));
          } catch (bytes memory _err) {
            revert(string(abi.encodePacked("Strategy low-level error: 0x", _toAsciiString(subStrategy), " ", string(_err))));
          }
        }
      } else {
        try __controller.doHardWork(vault) {}  catch Error(string memory _err) {
          revert(string(abi.encodePacked("Vault error: 0x", _toAsciiString(vault), " ", _err)));
        } catch (bytes memory _err) {
          revert(string(abi.encodePacked("Vault low-level error: 0x", _toAsciiString(vault), " ", string(_err))));
        }
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
    uint _lastHWCall = lastHWCall;
    _lastHWCall = _lastHWCall == 0 ? ControllableV2(address(this)).created() : _lastHWCall;
    uint _maxGas = maxGas;

    uint diff = block.timestamp - _lastHWCall;
    uint multiplier = diff * 100 / 1 days;
    return _maxGas + _maxGas * multiplier / 100;
  }

  function checker() external view returns (bool canExec, bytes memory execPayload) {
    if (tx.gasprice > maxGasAdjusted()) {
      return (false, abi.encodePacked("Too high gas: ", _toString(tx.gasprice / 1e9)));
    }

    IBookkeeper _bookkeeper = IBookkeeper(IController(_controller()).bookkeeper());
    uint _delay = delay;
    uint vaultsLength = _bookkeeper.vaultsLength();
    address[] memory vaults = new address[](vaultsLength);
    uint counter;
    for (uint i; i < vaultsLength; ++i) {
      address vault = _bookkeeper._vaults(i);
      if (!excludedVaults[vault] && ISmartVault(vault).active()) {

        uint delayAdjusted = _delay;
        uint _delayRate = delayRate[vault];
        if (_delayRate != 0) {
          delayAdjusted = _delay * _delayRate / DELAY_RATE_DENOMINATOR;
        }

        if (lastHW(vault) + _delay < block.timestamp) {
          vaults[i] = vault;
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
        if (vaults[i] != address(0)) {
          vaultsResult[j] = vaults[i];
          ++j;
        }
      }
      return (true, abi.encodeWithSelector(HardWorkResolver.call.selector, vaultsResult));
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
