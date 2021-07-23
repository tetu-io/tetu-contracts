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

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../governance/Controllable.sol";
import "./RewardToken.sol";

contract MintHelper is Controllable {
  using SafeMath for uint256;

  string public constant VERSION = "0";

  // NETWORK RATIOS
  uint256 constant public FIRST_NETWORK_RATIO = 33; // 33% goes to rewards for first network
  uint256 constant public TOTAL_NETWORK_RATIO = 100; // 67% goes to rewards for other networks

  // DISTRIBUTION RATIOS
  uint256 constant public BASE_RATIO = 7000; // 70% goes to rewards
  uint256 constant public FUNDS_RATIO = 3000; // 30% goes to different teams and the op fund
  uint256 constant public TOTAL_RATIO = 10000;

  mapping(address => uint256) public operatingFunds;
  address[] public operatingFundsList;


  event FundsChanged(address[] funds, uint256[] fractions);
  event AdminChanged(address newAdmin);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _controller Controller address
  function initialize(
    address _controller,
    address[] memory _funds,
    uint256[] memory _fundsFractions
  ) external initializer {
    Controllable.initializeControllable(_controller);
    setOperatingFunds(_funds, _fundsFractions);
  }

  function token() public view returns (address) {
    return IController(controller()).rewardToken();
  }

  /// @dev We will split weekly emission to two parts and use second part on other networks
  ///      Until we create a bridge contract we will send non polygon parts to FundKeeper contract
  function mintAndDistribute(uint256 totalAmount, address _distributor, address _otherNetworkFund) external onlyController {
    require(totalAmount != 0, "Amount should be greater than 0");
    require(token() != address(0), "Token not init");

    // we should start minting in the same time with mint for keep vesting schedule timing
    if (RewardToken(token()).mintingStartTs() == 0) {
      RewardToken(token()).startMinting();
    }

    uint256 amount = totalAmount.mul(FIRST_NETWORK_RATIO).div(TOTAL_NETWORK_RATIO);

    // move part of tokens to FundKeeper for future vesting
    uint256 fundAmount = totalAmount.sub(amount);
    ERC20PresetMinterPauser(token()).mint(_otherNetworkFund, fundAmount);

    // mint the base amount to distributor
    uint256 toDistributor = amount.mul(BASE_RATIO).div(TOTAL_RATIO);
    ERC20PresetMinterPauser(token()).mint(_distributor, toDistributor);

    uint256 sum = toDistributor;
    // mint to each fund
    for (uint256 i = 0; i < operatingFundsList.length; i++) {
      address fund = operatingFundsList[i];
      uint256 toFund = amount.mul(operatingFunds[fund]).div(TOTAL_RATIO);
      //a little trick to avoid rounding
      if (sum.add(toFund) > amount.sub(operatingFundsList.length).sub(1)
        && sum.add(toFund) < amount) {
        toFund = amount.sub(sum);
      }
      sum = sum.add(toFund);
      ERC20PresetMinterPauser(token()).mint(fund, toFund);
    }
    require(sum == amount, "wrong check sum");
  }

  function setOperatingFunds(address[] memory _funds, uint256[] memory _fractions) public onlyControllerOrGovernance {
    require(_funds.length != 0, "empty funds");
    require(_funds.length == _fractions.length, "wrong size");
    clearFunds();
    uint256 fractionSum;
    for (uint256 i = 0; i < _funds.length; i++) {
      require(_funds[i] != address(0), "Address should not be 0");
      require(_fractions[i] != 0, "Ratio should not be 0");
      fractionSum = fractionSum.add(_fractions[i]);
      operatingFunds[_funds[i]] = _fractions[i];
      operatingFundsList.push(_funds[i]);
    }
    require(fractionSum == FUNDS_RATIO, "wrong sum of fraction");
    emit FundsChanged(_funds, _fractions);
  }

  function clearFunds() private {
    for (uint256 i = 0; i < operatingFundsList.length; i++) {
      delete operatingFunds[operatingFundsList[i]];
      delete operatingFundsList[i];
    }
  }
}
