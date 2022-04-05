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
import "./../../../../third_party/aave/ILendingPool.sol";
import "../../../SlotsLib.sol";
import "./Pipe.sol";

/// @title Aave Pipe Contract
/// @author bogdoslav
contract AaveAmPipe is Pipe {
  using SafeERC20 for IERC20;
  using SlotsLib for uint;

  struct AaveAmPipeData {
    address pool;
    address sourceToken;
    address lpToken;
    address rewardToken;
  }

  uint internal constant _POOL_SLOT = uint(keccak256("eip1967.AaveAmPipe.pool")) - 1;

  function initialize(AaveAmPipeData memory _d) public {
    require(_d.pool != address(0), "Zero pool");
    require(_d.rewardToken != address(0), "Zero reward token");

    Pipe._initialize('AaveAmPipe', _d.sourceToken, _d.lpToken);

    _POOL_SLOT.set(_d.pool);
    _REWARD_TOKENS.push(_d.rewardToken);
  }

  // ************* SLOT SETTERS/GETTERS *******************
  function pool() external view returns (address) {
    return _pool();
  }

  function _pool() internal view returns (address) {
    return _POOL_SLOT.getAddress();
  }

  /// @dev Deposits to Aave
  /// @param amount to deposit (TOKEN)
  /// @return output amount of output units (amTOKEN)
  function put(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = maxSourceAmount(amount);
    if (amount > 0) {
      address sourceToken = _sourceToken();
      address __pool = _pool();
      _erc20Approve(sourceToken, __pool, amount);
      ILendingPool(__pool).deposit(sourceToken, amount, address(this), 0);
    }
    address outputToken = _outputToken();
    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(outputToken, output);
    emit Put(amount, output);
  }

  /// @dev Withdraws from Aave
  /// @param amount to withdraw
  /// @return output amount of source token
  function get(uint256 amount) override onlyPipeline external returns (uint256 output) {
    amount = _maxOutputAmount(amount);
    address sourceToken = _sourceToken();
    if (amount > 0) {
      address __pool = _pool();
      _erc20Approve(_outputToken(), __pool, amount);
      ILendingPool(__pool).withdraw(sourceToken, amount, address(this));
    }
    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
    emit Get(amount, output);
  }

}
