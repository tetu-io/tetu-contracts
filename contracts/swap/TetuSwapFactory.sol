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
import "./interfaces/ITetuSwapFactory.sol";

contract TetuSwapFactory is ITetuSwapFactory {
  address public override feeTo;
  address public override feeToSetter;

  mapping(address => mapping(address => address)) public override getPair;
  address[] public override allPairs;

  event PairCreated(address indexed token0, address indexed token1, address pair, uint);

  constructor(address _feeToSetter) {
    feeToSetter = _feeToSetter;
  }

  function allPairsLength() external view override returns (uint) {
    return allPairs.length;
  }

  function createPair(address tokenA, address tokenB) external override returns (address pair) {
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
    TetuSwapPair(pair).initialize(token0, token1);
    getPair[token0][token1] = pair;
    getPair[token1][token0] = pair;
    // populate mapping in the reverse direction
    allPairs.push(pair);
    emit PairCreated(token0, token1, pair, allPairs.length);
  }

  function setFeeTo(address _feeTo) external {
    require(msg.sender == feeToSetter, "TSF: FORBIDDEN");
    feeTo = _feeTo;
  }

  function setFeeToSetter(address _feeToSetter) external {
    require(msg.sender == feeToSetter, "TSF: FORBIDDEN");
    feeToSetter = _feeToSetter;
  }

  // todo REMOVE
  function calcHash() external view returns (bytes32) {
    bytes memory bytecode = type(TetuSwapPair).creationCode;
    return keccak256(abi.encodePacked(bytecode));
  }

  function setVaultsForPair(address _vaultA, address _vaultB) external {
    require(msg.sender == feeToSetter, "TSF: FORBIDDEN");
    address _tokenA = ISmartVault(_vaultA).underlying();
    address _tokenB = ISmartVault(_vaultB).underlying();
    address _pair = getPair[_tokenA][_tokenB];
    require(_pair != address(0), "TSF: Pair not found");

    (address _vault0, address _vault1) = _tokenA < _tokenB ? (_vaultA, _vaultB) : (_vaultB, _vaultA);
    TetuSwapPair(_pair).setVaults(_vault0, _vault1);
  }
}
