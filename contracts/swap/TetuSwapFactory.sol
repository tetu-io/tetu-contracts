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

/// @title Tetu swap factory based on Uniswap code
/// @dev Use with TetuProxyControlled.sol
/// @author belbix
contract TetuSwapFactory is Controllable, FactoryStorage {

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.1.0";
  uint256 public constant TIME_LOCK = 48 hours;
  uint256 public constant DEFAULT_FEE = 10;

  event PairCreated(address indexed token0, address indexed token1, address pair, uint);
  event VaultsChangeAnnounced(address pair, address _vaultA, address vaultB);
  event PairFeeChangeAnnounced(address pair);
  event ChangePairRewardRecipient(address pair, address oldRecipient, address newRecipient);
  event ChangedPairFee(address pair, uint oldFee, uint newFee);
  event ChangedVaultsForPair(
    address pair,
    address oldVault0,
    address oldVault1,
    address newVault0,
    address newVault1
  );

  /// @dev Operations allowed for Governance or HardWorker addresses
  modifier onlyHardWorker() {
    require(IController(controller()).isHardWorker(msg.sender), "TSF: Forbidden");
    _;
  }

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  ///      Initialize Controllable with sender address
  function initialize(address _controller) external initializer {
    Controllable.initializeControllable(_controller);
  }

  /// @dev Pairs length
  function allPairsLength() external view override returns (uint) {
    return allPairs.length;
  }

  /// @dev Create a pair for given vaults. This function has strict access. Users unable to create pairs themself
  function createPair(address vaultA, address vaultB) external override onlyHardWorker returns (address pair) {
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
    TetuSwapPair(pair).initialize(token0, token1, DEFAULT_FEE);
    getPair[token0][token1] = pair;
    // populate mapping in the reverse direction
    getPair[token1][token0] = pair;
    allPairs.push(pair);
    validPairs[pair] = true;
    _setVaultsForPair(pair, vaultA, vaultB);
    emit PairCreated(token0, token1, pair, allPairs.length);
  }

  // *************** GOV FUNCTIONS *******************************

  /// @dev Announce vaults change for a pair with according underlying assets
  function announceVaultsChange(address _vaultA, address _vaultB) external onlyControllerOrGovernance {
    address _tokenA = ISmartVault(_vaultA).underlying();
    address _tokenB = ISmartVault(_vaultB).underlying();
    address _pair = getPair[_tokenA][_tokenB];
    require(_pair != address(0), "TSF: Pair not found");
    require(timeLocks[_pair] == 0, "TSF: Time-lock already defined");

    timeLocks[_pair] = block.timestamp + TIME_LOCK;
    emit VaultsChangeAnnounced(_pair, _vaultA, _vaultB);
  }

  /// @dev Announce fee change for given pairs
  function announcePairsFeeChange(address[] memory _pairs) external onlyControllerOrGovernance {
    for (uint i; i < _pairs.length; i++) {
      address _pair = _pairs[i];
      require(validPairs[_pair], "TSF: Invalid pair");
      require(timeLocks[_pair] == 0, "TSF: Time-lock already defined");
      timeLocks[_pair] = block.timestamp + TIME_LOCK;
      emit PairFeeChangeAnnounced(_pair);
    }
  }

  /// @dev Set underlying vaults rewards recipient. It should be TetuSwapStrategy as part of the general architecture
  ///      This function doesn't have time-lock as non-critical functionality without effect on users funds
  function setPairRewardRecipients(address[] memory _pairs, address[] memory _recipients) external onlyControllerOrGovernance {
    require(_pairs.length == _recipients.length, "TSF: Wrong arrays");
    for (uint i = 0; i < _pairs.length; i++) {
      require(validPairs[_pairs[i]], "TSF: Pair not found");
      emit ChangePairRewardRecipient(_pairs[i], TetuSwapPair(_pairs[i]).rewardRecipient(), _recipients[i]);
      TetuSwapPair(_pairs[i]).setRewardRecipient(_recipients[i]);
    }
  }

  /// @dev Change given pairs fee. Time-lock assume
  function setPairsFee(address[] memory _pairs, uint256 _fee) external onlyControllerOrGovernance {
    for (uint i; i < _pairs.length; i++) {
      address _pair = _pairs[i];
      require(timeLocks[_pair] != 0 && timeLocks[_pair] < block.timestamp, "TSF: Too early");
      require(validPairs[_pair], "TSF: Pair not found");
      emit ChangedPairFee(_pair, TetuSwapPair(_pair).fee(), _fee);
      TetuSwapPair(_pair).setFee(_fee);
      delete timeLocks[_pair];
    }
  }

  /// @dev Set new vaults for a pair with according underlying assets. Time-lock assume
  function setVaultsForPair(address _vaultA, address _vaultB) external onlyControllerOrGovernance {
    address _tokenA = ISmartVault(_vaultA).underlying();
    address _tokenB = ISmartVault(_vaultB).underlying();
    address _pair = getPair[_tokenA][_tokenB];
    require(_pair != address(0), "TSF: Pair not found");

    require(timeLocks[_pair] != 0 && timeLocks[_pair] < block.timestamp, "TSF: Too early");
    _setVaultsForPair(_pair, _vaultA, _vaultB);
    delete timeLocks[_pair];
  }

  function _setVaultsForPair(address _pair, address _vaultA, address _vaultB) private {
    address _tokenA = ISmartVault(_vaultA).underlying();
    address _tokenB = ISmartVault(_vaultB).underlying();
    (address _vault0, address _vault1) = _tokenA < _tokenB ? (_vaultA, _vaultB) : (_vaultB, _vaultA);
    emit ChangedVaultsForPair(
      _pair,
      TetuSwapPair(_pair).vault0(),
      TetuSwapPair(_pair).vault1(),
      _vault0,
      _vault1
    );
    TetuSwapPair(_pair).setVaults(_vault0, _vault1);
  }
}
