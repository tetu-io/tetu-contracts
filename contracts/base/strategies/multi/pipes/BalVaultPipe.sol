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

import "./../../../../openzeppelin/IERC20.sol";
import "./../../../../openzeppelin/SafeERC20.sol";
import "../../../../openzeppelin/Math.sol";
import "./../../../../third_party/balancer/IBVaultLocalOZ.sol";
import "./../../../../third_party/balancer/IMerkleOrchard.sol";
import "../../../interface/IControllableExtended.sol";
import "../../../interface/IController.sol";
import "../../../SlotsLib.sol";
import "./Pipe.sol";

/// @title Balancer Vault Pipe Contract
/// @author bogdoslav
contract BalVaultPipe is Pipe {
  using SafeERC20 for IERC20;
  using SlotsLib for bytes32;

  struct BalVaultPipeData {
    address sourceToken;
    address vault;
    bytes32 poolID;
    uint256 tokenIndex;
    address lpToken;
    address rewardToken;
  }

 bytes32 internal constant _VAULT_SLOT       = bytes32(uint(keccak256("eip1967.BalVaultPipe.vault")) - 1);
 bytes32 internal constant _POOL_ID_SLOT     = bytes32(uint(keccak256("eip1967.BalVaultPipe.poolID")) - 1);
 bytes32 internal constant _TOKEN_INDEX_SLOT = bytes32(uint(keccak256("eip1967.BalVaultPipe.tokenIndex")) - 1);

  function initialize(BalVaultPipeData memory _d) public {
    require(_d.vault != address(0), "Zero vault");
    require(_d.rewardToken != address(0), "Zero reward token");

    Pipe._initialize('BalVaultPipe', _d.sourceToken, _d.lpToken);

    _VAULT_SLOT.set(_d.vault);
    _POOL_ID_SLOT.set(_d.poolID);
    _TOKEN_INDEX_SLOT.set(_d.tokenIndex);

    _REWARD_TOKENS.push(_d.rewardToken);
  }

  // ************* SLOT SETTERS/GETTERS *******************
  function vault() external view returns (address) {
    return _vault();
  }

  function _vault() internal view returns (address) {
    return _VAULT_SLOT.getAddress();
  }

  function poolID() external view returns (bytes32) {
    return _poolID();
  }

  function _poolID() internal view returns (bytes32) {
    return _POOL_ID_SLOT.getBytes32();
  }

  function tokenIndex() external view returns (uint) {
    return _tokenIndex();
  }

  function _tokenIndex() internal view returns (uint) {
    return _TOKEN_INDEX_SLOT.getUint();
  }

  /// @dev Joins to the Balancer pool
  /// @param amount in source units
  /// @return output in underlying units
  function put(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = maxSourceAmount(amount);
    address sourceToken = _sourceToken();
    if (amount != 0) {
      uint __tokenIndex = _tokenIndex();
      address __vault = _vault();
      bytes32 __poolID = _poolID();
      (IERC20[] memory tokens,,) = IBVault(__vault).getPoolTokens(__poolID);
      require(sourceToken == address(tokens[__tokenIndex]), "BVP: Wrong source token");
      uint256[] memory maxAmountsIn = new uint256[](4);
      maxAmountsIn[__tokenIndex] = amount;

      bytes memory userData = abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, maxAmountsIn, 1);

      IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
      assets : asIAsset(tokens),
      maxAmountsIn : maxAmountsIn,
      userData : userData,
      fromInternalBalance : false
      });

      _erc20Approve(sourceToken, __vault, amount);
      IBVault(__vault).joinPool(__poolID, address(this), address(this), request);
    }

    address outputToken = _outputToken();
    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(outputToken, output);
    emit Put(amount, output);

  }

  /// @dev Exits from the Balancer pool
  /// @param amount in underlying units
  /// @return output in source units
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = _maxOutputAmount(amount);
    address outputToken = _outputToken();
    address sourceToken = _sourceToken();

    if (amount != 0) {
      uint __tokenIndex = _tokenIndex();
      address __vault = _vault();
      bytes32 __poolID = _poolID();
      uint256 lpBalance = _erc20Balance(outputToken);
      amount = Math.min(amount, lpBalance);

      (IERC20[] memory tokens,,) = IBVault(__vault).getPoolTokens(__poolID);
      require(sourceToken == address(tokens[__tokenIndex]), "BVP: Wrong source token");
      uint256[] memory minAmountsOut = new uint256[](4);
      minAmountsOut[__tokenIndex] = 1;

      bytes memory userData = abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, amount, __tokenIndex);

      IBVault.ExitPoolRequest memory request = IBVault.ExitPoolRequest({
      assets : asIAsset(tokens),
      minAmountsOut : minAmountsOut,
      userData : userData,
      toInternalBalance : false
      });

      _erc20Approve(outputToken, __vault, amount);
      IBVault(__vault).exitPool(__poolID, address(this), payable(address(this)), request);
    }

    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
    emit Get(amount, output);
  }

  /// @dev Casts IERC20[] to IAsset[]
  /// @param tokens IERC20 array
  /// @param assets IAsset array
  function asIAsset(IERC20[] memory tokens) private pure returns (IAsset[] memory assets) {
    // solhint-disable-next-line no-inline-assembly
    assembly {
      assets := tokens
    }
  }

  /// @dev Proxy function to claim balancer rewards (see https://docs.balancer.fi/products/merkle-orchard/claiming-tokens)
  /// @param merkleOrchard IERC20 array
  /// @param claims Claims array
  /// @param tokens Reward tokens array
  function claimDistributions(
    address merkleOrchard,
    IMerkleOrchard.Claim[] memory claims,
    address[] memory tokens
  ) external {
    IController controller = IController(_controller());
    require(controller.isHardWorker(msg.sender) || controller.governance() == msg.sender, 'BVP: Not HW or Gov');

    IMerkleOrchard(merkleOrchard).claimDistributions(address(this), claims, tokens);
  }

}
