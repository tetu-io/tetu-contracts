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

import "../../../../openzeppelin/Math.sol";
import "./Pipe.sol";
import "./../../../../third_party/balancer/IBVault.sol";

/// @title Balancer Vault Pipe Contract
/// @author bogdoslav
contract BalVaultPipe is Pipe {
  using SafeERC20 for IERC20;

  struct BalVaultPipeData {
    address sourceToken;
    address vault;
    bytes32 poolID;
    uint256 tokenIndex;
    address lpToken;
    address rewardToken;
  }

  BalVaultPipeData public pipeData;

  constructor(BalVaultPipeData memory _d) Pipe(
    'BalVaultPipe',
    _d.sourceToken,
    _d.lpToken
  ) {
    require(_d.vault != address(0), "Zero vault");
    require(_d.rewardToken != address(0), "Zero reward token");

    pipeData = _d;
    rewardTokens.push(_d.rewardToken);
  }

  /// @dev Joins to the Balancer pool
  /// @param amount in source units
  /// @return output in underlying units
  function put(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = maxSourceAmount(amount);
    if (amount != 0) {
      (IERC20[] memory tokens,,) = IBVault(pipeData.vault).getPoolTokens(pipeData.poolID);
      require(pipeData.sourceToken == address(tokens[pipeData.tokenIndex]), "BVP: Wrong source token");
      uint256[] memory maxAmountsIn = new uint256[](4);
      maxAmountsIn[pipeData.tokenIndex] = amount;

      bytes memory userData = abi.encode(IBVault.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT, maxAmountsIn, 1);

      IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
      assets : asIAsset(tokens),
      maxAmountsIn : maxAmountsIn,
      userData : userData,
      fromInternalBalance : false
      });

      _erc20Approve(sourceToken, pipeData.vault, amount);
      IBVault(pipeData.vault).joinPool(pipeData.poolID, address(this), address(this), request);
    }

    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(outputToken, output);
    emit Put(amount, output);

  }

  /// @dev Exits from the Balancer pool
  /// @param amount in underlying units
  /// @return output in source units
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = maxOutputAmount(amount);
    if (amount != 0) {
      uint256 lpBalance = _erc20Balance(outputToken);
      amount = Math.min(amount, lpBalance);

      (IERC20[] memory tokens,,) = IBVault(pipeData.vault).getPoolTokens(pipeData.poolID);
      require(sourceToken == address(tokens[pipeData.tokenIndex]), "BVP: Wrong source token");
      uint256[] memory minAmountsOut = new uint256[](4);
      minAmountsOut[pipeData.tokenIndex] = 1;

      bytes memory userData = abi.encode(IBVault.ExitKind.EXACT_BPT_IN_FOR_ONE_TOKEN_OUT, amount, pipeData.tokenIndex);

      IBVault.ExitPoolRequest memory request = IBVault.ExitPoolRequest({
      assets : asIAsset(tokens),
      minAmountsOut : minAmountsOut,
      userData : userData,
      toInternalBalance : false
      });

      _erc20Approve(outputToken, pipeData.vault, amount);
      IBVault(pipeData.vault).exitPool(pipeData.poolID, address(this), payable(address(this)), request);
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

}
