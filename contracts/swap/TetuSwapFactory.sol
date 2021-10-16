// SPDX-License-Identifier: UNLICENSED
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

import "./TetuSwapPair.sol";
import "../base/interface/ISmartVault.sol";
import "../base/governance/Controllable.sol";
import "./FactoryStorage.sol";

contract TetuSwapFactory is Controllable, FactoryStorage {

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  uint256 public constant TIME_LOCK = 48 hours;
  uint256 public constant DEFAULT_FEE = 10;

  event PairCreated(address indexed token0, address indexed token1, address pair, uint);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  ///      Initialize Controllable with sender address
  function initialize(address _controller) external initializer {
    Controllable.initializeControllable(_controller);
  }

  function allPairsLength() external view override returns (uint) {
    return allPairs.length;
  }

  function createPair(address vaultA, address vaultB) external override returns (address pair) {
    address tokenA = ISmartVault(vaultA).underlying();
    address tokenB = ISmartVault(vaultB).underlying();
    require(tokenA != tokenB, "TSF: IDENTICAL_ADDRESSES");
    (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    require(token0 != address(0), "TSF: ZERO_ADDRESS");
    require(getPair[token0][token1] == address(0), "TSF: PAIR_EXISTS");
    // single check is sufficient
    bytes memory bytecode = type(TetuSwapPair).creationCode;
    bytes32 salt = keccak256(abi.encodePacked(token0, token1));
    assembly {
      pair := create2(0, add(bytecode, 32), mload(bytecode), salt)
    }
    TetuSwapPair(pair).initialize(token0, token1, controller(), DEFAULT_FEE);
    getPair[token0][token1] = pair;
    // populate mapping in the reverse direction
    getPair[token1][token0] = pair;
    allPairs.push(pair);
    validPairs[pair] = true;
    _setVaultsForPair(pair, vaultA, vaultB);
    emit PairCreated(token0, token1, pair, allPairs.length);
  }

  // todo REMOVE
  function calcHash() external view returns (bytes32) {
    bytes memory bytecode = type(TetuSwapPair).creationCode;
    return keccak256(abi.encodePacked(bytecode));
  }

  function setPairFee(address _pair, uint256 _fee) external onlyControllerOrGovernance {
    require(validPairs[_pair], "TSF: Pair not found");
    TetuSwapPair(_pair).setFee(_fee);
  }

  function setPairRewardRecipient(address _pair, address _recipient) external onlyControllerOrGovernance {
    require(validPairs[_pair], "TSF: Pair not found");
    TetuSwapPair(_pair).setRewardRecipient(_recipient);
  }

  function announceVaultsChange(address _vaultA, address _vaultB) external onlyControllerOrGovernance {
    address _tokenA = ISmartVault(_vaultA).underlying();
    address _tokenB = ISmartVault(_vaultB).underlying();
    address _pair = getPair[_tokenA][_tokenB];
    require(_pair != address(0), "TSF: Pair not found");

    require(timeLocks[_pair] == 0, "TSF: Time-lock already defined");

    timeLocks[_pair] = block.timestamp + TIME_LOCK;
  }

  function setVaultsForPair(address _vaultA, address _vaultB) external onlyControllerOrGovernance {
    address _tokenA = ISmartVault(_vaultA).underlying();
    address _tokenB = ISmartVault(_vaultB).underlying();
    address _pair = getPair[_tokenA][_tokenB];
    require(_pair != address(0), "TSF: Pair not found");

    require(timeLocks[_pair] != 0 && timeLocks[_pair] < block.timestamp, "TSF: Too early");
    _setVaultsForPair(_pair, _vaultA, _vaultB);
    timeLocks[_pair] = 0;
  }

  function _setVaultsForPair(address _pair, address _vaultA, address _vaultB) private {
    address _tokenA = ISmartVault(_vaultA).underlying();
    address _tokenB = ISmartVault(_vaultB).underlying();
    (address _vault0, address _vault1) = _tokenA < _tokenB ? (_vaultA, _vaultB) : (_vaultB, _vaultA);
    TetuSwapPair(_pair).setVaults(_vault0, _vault1);
  }
}
