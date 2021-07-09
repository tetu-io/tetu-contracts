//SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/presets/ERC20PresetMinterPauser.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../governance/Controllable.sol";
import "./RewardToken.sol";

contract MintHelper is Controllable {
  using SafeMath for uint256;

  string public constant VERSION = "0";

  uint256 public baseRatio = 7000; // 70% always goes to rewards
  uint256 public fundsRatio = 3000; // 30% goes to different teams and the op fund
  uint256 public totalRatio = 10000;

  mapping(address => uint256) public operatingFunds;
  address[] public operatingFundsList;


  event FundsChanged(address[] funds, uint256[] fractions);
  event AdminChanged(address newAdmin);

  constructor(
    address _controller,
    address[] memory _funds,
    uint256[] memory _fundsFractions
  ) {
    Controllable.initializeControllable(_controller);
    setOperatingFunds(_funds, _fundsFractions);
  }

  function distributor() public view returns (address){
    return IController(controller()).notifyHelper();
  }

  function token() public view returns (address) {
    return IController(controller()).rewardToken();
  }

  function startMinting() external onlyControllerOrGovernance {
    require(RewardToken(token()).mintingStartTs() == 0, "already started");
    RewardToken(token()).startMinting();
  }

  function mint(uint256 amount) external onlyControllerOrGovernance {
    require(amount != 0, "Amount should be greater than 0");
    require(token() != address(0), "Token not init");

    // mint the base amount to distributor
    uint256 toDistributor = amount.mul(baseRatio).div(totalRatio);
    ERC20PresetMinterPauser(token()).mint(distributor(), toDistributor);

    uint256 sum = toDistributor;
    // mint to each fund
    for (uint256 i; i < operatingFundsList.length; i++) {
      address fund = operatingFundsList[i];
      uint256 toFund = amount.mul(operatingFunds[fund]).div(totalRatio);
      //a little trick to avoid rounding
      if (sum.add(toFund) > amount.sub(operatingFundsList.length).sub(1)
        && sum.add(toFund) < amount) {
        toFund = amount.sub(sum);
      }
      sum += toFund;
      ERC20PresetMinterPauser(token()).mint(fund, toFund);
    }
    require(sum == amount, "wrong check sum");
  }

  function setOperatingFunds(address[] memory _funds, uint256[] memory _fractions) public onlyControllerOrGovernance {
    require(_funds.length != 0, "empty funds");
    require(_funds.length == _fractions.length, "wrong size");
    clearFunds();
    uint256 fractionSum;
    for (uint256 i; i < _funds.length; i++) {
      require(_funds[i] != address(0), "Address should not be 0");
      require(_fractions[i] != 0, "Ratio should not be 0");
      fractionSum += _fractions[i];
      operatingFunds[_funds[i]] = _fractions[i];
      operatingFundsList.push(_funds[i]);
    }
    require(fractionSum == fundsRatio, "wrong sum of fraction");
    emit FundsChanged(_funds, _fractions);
  }

  function clearFunds() private {
    for (uint256 i; i < operatingFundsList.length; i++) {
      delete operatingFunds[operatingFundsList[i]];
      delete operatingFundsList[i];
    }
  }

  function changeAdmin(address _newAdmin) public onlyControllerOrGovernance {
    require(token() != address(0), "Token not init");
    require(_newAdmin != address(0), "Address should not be 0");
    RewardToken(token()).changeOwner(_newAdmin);
    emit AdminChanged(_newAdmin);
  }
}
