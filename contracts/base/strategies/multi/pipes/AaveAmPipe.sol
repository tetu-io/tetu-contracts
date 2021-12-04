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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Pipe.sol";
import "./../../../../third_party/aave/ILendingPool.sol";

/// @title Aave Pipe Contract
/// @author bogdoslav
contract AaveAmPipe is Pipe {
  using SafeERC20 for IERC20;

  struct AaveAmPipeData {
    address pool;
    address sourceToken;
    address lpToken;
    address rewardToken;
  }

  AaveAmPipeData public pipeData;

  constructor(AaveAmPipeData memory _d) Pipe(
    'AaveAmPipe',
    _d.sourceToken,
    _d.lpToken
  ) {
    require(_d.pool != address(0), "Zero pool");
    require(_d.rewardToken != address(0), "Zero reward token");

    pipeData = _d;
    rewardTokens.push(_d.rewardToken);
  }

  /// @dev Deposits to Aave
  /// @param amount to deposit (TOKEN)
  /// @return output amount of output units (amTOKEN)
  function put(uint256 amount) override onlyPipeline external returns (uint256 output) {
    _erc20Approve(sourceToken, pipeData.pool, amount);
    ILendingPool(pipeData.pool).deposit(sourceToken, amount, address(this), 0);
    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(outputToken, output);
  }

  /// @dev Withdraws from Aave
  /// @param amount to withdraw
  /// @return output amount of source token
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    _erc20Approve(outputToken, pipeData.pool, amount);
    ILendingPool(pipeData.pool).withdraw(sourceToken, amount, address(this));
    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
  }

}
