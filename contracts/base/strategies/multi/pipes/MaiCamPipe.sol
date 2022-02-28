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
import "./../../../../openzeppelin/Initializable.sol";
import "./Pipe.sol";
import "./../../../../third_party/qidao/ICamToken.sol";

/// @title Mai CamWMatic Pipe Contract
/// @author bogdoslav
contract MaiCamPipe is Pipe {
  using SafeERC20 for IERC20;

  struct MaiCamPipeData {
    address sourceToken;
    address lpToken;
    address rewardToken;
  }

  /// @dev creates context
  function initialize(MaiCamPipeData memory _d) public initializer {
    require(_d.rewardToken != address(0), "Zero reward token");

    Pipe._initialize('MaiCamTokenPipe', _d.sourceToken, _d.lpToken);

    rewardTokens.push(_d.rewardToken);
  }

  /// @dev function for investing, deposits, entering, borrowing
  /// @param amount in source units
  /// @return output in underlying units
  function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
    amount = maxSourceAmount(amount);
    address outputToken = _outputToken();
    _erc20Approve(_sourceToken(), outputToken, amount);
    ICamToken(outputToken).enter(amount);
    output = _erc20Balance(outputToken);
    _transferERC20toNextPipe(outputToken, output);
    emit Put(amount, output);
  }

  /// @dev function for de-vesting, withdrawals, leaves, paybacks
  /// @param amount in underlying units
  /// @return output in source units
  function get(uint256 amount) override onlyPipeline  public returns (uint256 output) {
    amount = maxOutputAmount(amount);
    ICamToken(_outputToken()).leave(amount);
    address sourceToken = _sourceToken();
    output = _erc20Balance(sourceToken);
    _transferERC20toPrevPipe(sourceToken, output);
    emit Get(amount, output);
  }

}
