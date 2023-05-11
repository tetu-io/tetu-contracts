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

import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/SafeMath.sol";
import "../governance/Controllable.sol";
import "./RewardToken.sol";
import "../interfaces/IMintHelper.sol";

/// @title Contract for interacting with RewardToken(TETU) contract. Owner of TETU.
/// @dev Use with TetuProxy
/// @author belbix
contract MintHelper is Controllable, IMintHelper {
  using SafeMath for uint256;

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";

  // NETWORK RATIOS
  /// @notice 33% goes to rewards for first network
  uint256 constant public FIRST_NETWORK_RATIO = 33;
  /// @notice 67% goes to rewards for other networks
  uint256 constant public TOTAL_NETWORK_RATIO = 100;

  // DISTRIBUTION RATIOS
  /// @notice 70% goes to Vault rewards
  uint256 constant public BASE_RATIO = 7000;
  /// @notice 30% goes to different teams and the op fund
  uint256 constant public FUNDS_RATIO = 3000;
  /// @notice Total ratio should be 100%
  uint256 constant public TOTAL_RATIO = 10000;

  /// @notice Dev Funds fraction mapping, be default contains only GnosisSafe Wallet
  mapping(address => uint256) public devFunds;
  /// @notice List of all Dev Funds
  address[] public override devFundsList;

  /// @notice Dev Funds changed
  event FundsChanged(address[] funds, uint256[] fractions);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  /// @param _controller Controller address
  /// @param _funds Dev Funds addresses, by default only one - GnosisSafe Wallet
  /// @param _fundsFractions Dev Funds fractions
  function initialize(
    address _controller,
    address[] memory _funds,
    uint256[] memory _fundsFractions
  ) external initializer {
    Controllable.initializeControllable(_controller);
    setDevFunds(_funds, _fundsFractions);
  }

  /// @notice Token linked to this contract. TETU by default
  /// @return Token address
  function token() public view returns (address) {
    return IController(controller()).rewardToken();
  }

  /// @notice Dev Funds array size
  /// @return Length of dev funds array
  function devFundsLength() public view returns (uint256) {
    return devFundsList.length;
  }

  /// @dev We will split weekly emission to two parts and use second part on other networks
  ///      Until we create a bridge contract we will send non polygon parts to FundKeeper contract
  /// @param totalAmount Total amount of tokens for mint.
  ///                    If mintAllAvailable=true must be zero.
  ///                    If mintAllAvailable=true maxTotalSupplyForCurrentBlock will be used
  /// @param _distributor Holder for a part of emission for Vault vesting. NotifyHelper by default
  /// @param _otherNetworkFund Holder for a part for other networks. FundKeeper by default
  /// @param mintAllAvailable if true instead of amount will be used maxTotalSupplyForCurrentBlock - totalSupply
  function mintAndDistribute(
    uint256 totalAmount,
    address _distributor,
    address _otherNetworkFund,
    bool mintAllAvailable
  ) external override onlyController {
    require(totalAmount != 0 || mintAllAvailable, "Amount should be greater than 0");
    require(token() != address(0), "Token not init");

    // we should start minting in the same time with mint for keep vesting schedule timing
    if (RewardToken(token()).mintingStartTs() == 0) {
      RewardToken(token()).startMinting();
    }

    if (mintAllAvailable) {
      require(totalAmount == 0, "use zero amount for mintAllAvailable");
      totalAmount = RewardToken(token()).maxTotalSupplyForCurrentBlock().sub(RewardToken(token()).totalSupply());
    }

    uint256 amount = totalAmount.mul(FIRST_NETWORK_RATIO).div(TOTAL_NETWORK_RATIO);

    // move part of tokens to FundKeeper for future vesting
    uint256 fundAmount = totalAmount.sub(amount);
    RewardToken(token()).mint(_otherNetworkFund, fundAmount);

    // mint the base amount to distributor
    uint256 toDistributor = amount.mul(BASE_RATIO).div(TOTAL_RATIO);
    RewardToken(token()).mint(_distributor, toDistributor);

    uint256 sum = toDistributor;
    // mint to each fund
    for (uint256 i = 0; i < devFundsList.length; i++) {
      address fund = devFundsList[i];
      uint256 toFund = amount.mul(devFunds[fund]).div(TOTAL_RATIO);
      //a little trick to avoid rounding
      if (sum.add(toFund) > amount.sub(devFundsList.length).sub(1)
        && sum.add(toFund) < amount) {
        toFund = amount.sub(sum);
      }
      sum = sum.add(toFund);
      RewardToken(token()).mint(fund, toFund);
    }
    require(sum == amount, "wrong check sum");
  }

  /// @notice Set up new Dev Funds. Both arrays should have the same length
  /// @param _funds Funds addresses
  /// @param _fractions Funds fractions
  function setDevFunds(address[] memory _funds, uint256[] memory _fractions) public onlyControllerOrGovernance {
    require(_funds.length != 0, "empty funds");
    require(_funds.length == _fractions.length, "wrong size");
    clearFunds();
    uint256 fractionSum;
    for (uint256 i = 0; i < _funds.length; i++) {
      require(_funds[i] != address(0), "Address should not be 0");
      require(_fractions[i] != 0, "Ratio should not be 0");
      fractionSum = fractionSum.add(_fractions[i]);
      for (uint256 j = 0; j < devFundsList.length; j++) {
        require(devFundsList[j] != _funds[i], "duplicate fund");
      }
      devFunds[_funds[i]] = _fractions[i];
      devFundsList.push(_funds[i]);
    }
    require(fractionSum == FUNDS_RATIO, "wrong sum of fraction");
    emit FundsChanged(_funds, _fractions);
  }

  /// @dev Remove all records about Dev Funds
  function clearFunds() private {
    for (uint256 i = devFundsList.length; i > 0; i--) {
      // refund some gas
      delete devFunds[devFundsList[i - 1]];
      delete devFundsList[i - 1];
      devFundsList.pop();
    }
  }
}
