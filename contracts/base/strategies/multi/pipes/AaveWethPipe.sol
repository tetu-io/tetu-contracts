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
import "./../../../../third_party/aave/IWETHGateway.sol";

/// @title Aave Weth Pipe Contract
/// @author bogdoslav
contract AaveWethPipe is Pipe {
  using SafeERC20 for IERC20;

  struct AaveWethPipeData {
    address eth;
    address wethGateway;
    address pool;
    address lpToken;
    address rewardToken;
  }

  AaveWethPipeData public pipeData;

  constructor(address _pipeline, AaveWethPipeData memory _d) Pipe(
    _pipeline,
    'AaveWethPipe',
    _d.eth,
    _d.lpToken
  ) {
    require(_d.wethGateway != address(0), "Zero wethGateway");
    require(_d.pool != address(0), "Zero pool");
    require(_d.rewardToken != address(0), "Zero reward token");

    pipeData = _d;
    rewardTokens.push(_d.rewardToken);
  }

  /// @dev Deposits MATIC to Aave
  /// @param amount to deposit (MATIC)
  /// @return output amount of output units (amMATIC)
  function put(uint256 amount) override onlyPipeline external returns (uint256 output) {
    IWETHGateway(pipeData.wethGateway).depositETH{value : amount}(pipeData.pool, address(this), 0);
    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(outputToken, output);
  }

  /// @dev Withdraws MATIC from Aave
  /// @param amount to unwrap
  /// @return output amount of source units (MATIC)
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    _erc20Approve(outputToken, pipeData.wethGateway, amount);
    IWETHGateway(pipeData.wethGateway).withdrawETH(pipeData.pool, amount, address(this));

    output = address(this).balance;
    if (hasPrevPipe()) {
      payable(payable(address(prevPipe))).transfer(output);
    }
  }

  /// @dev available MATIC source balance
  /// @return balance in source units
  function sourceBalance() override external view returns (uint256) {
    return address(this).balance;
  }

  /// @dev to receive Ether (Matic) from Aave
  receive() external payable {}

}
