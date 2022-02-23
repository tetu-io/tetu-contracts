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

import "./../../../openzeppelin/SafeERC20.sol";
import "./../../../third_party/IERC20Extended.sol";
import "./../ProxyStrategyBase.sol";
import "./pipelines/LinearPipeline.sol";
import "../../interface/strategies/IMaiStablecoinPipe.sol";
import "../../interface/strategies/IAaveMaiBalStrategyBase.sol";

/// @title AAVE->MAI->BAL Multi Strategy
/// @author belbix, bogdoslav
contract AaveMaiBalStrategyBase is ProxyStrategyBase, LinearPipeline, IAaveMaiBalStrategyBase {
  using SafeERC20 for IERC20;

  /// @notice Strategy type for statistical purposes
  string public constant override STRATEGY_NAME = "AaveMaiBalStrategyBase";
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "2.0.0";
  /// @dev Placeholder, for non full buyback need to implement liquidation
  uint256 private constant _BUY_BACK_RATIO = 10000;

  /// @dev Assets should reflect underlying tokens for investing
  address[] private _assets;

  // cached total amount in underlying tokens, updated after each deposit, withdraw and hardwork
  uint256 public _totalAmount = 0;

  IMaiStablecoinPipe internal _maiStablecoinPipe;
  IPipe internal _maiCamPipe;

  event SalvagedFromPipeline(address recipient, address token);
  event SetTargetPercentage(uint256 _targetPercentage);
  event SetMaxImbalance(uint256 _maxImbalance);

  /// @notice Contract initializer
  function initializeAaveMaiBalStrategyBase(
    address _controller,
    address _underlyingToken,
    address _vault,
    address[] memory __rewardTokens
  ) public initializer
  {
    require(_controller != address(0), "Zero controller");
    require(_underlyingToken != address(0), "Zero underlying");
    require(_vault != address(0), "Zero vault");

    initializeStrategyBase(
      _controller, _underlyingToken, _vault, __rewardTokens, _BUY_BACK_RATIO);
    initializeLinearPipeline(_underlyingToken);

    _rewardTokens = __rewardTokens;
    _assets.push(_underlyingToken);
  }

  //************************ MODIFIERS **************************

  /// @dev Only for Governance/Controller.
  modifier onlyControllerOrGovernance() {
    require(msg.sender == address(_controller())
      || IController(_controller()).governance() == msg.sender,
      "AMB: Not Gov or Controller");
    _;
  }
  modifier updateTotalAmount() {
    _;
    _totalAmount = getTotalAmountOut();
  }

  /// @dev Returns reward pool balance
  function _rewardPoolBalance() internal override view returns (uint256 bal) {
    return _totalAmount;
  }

  /// @dev HardWork function for Strategy Base implementation
  function doHardWork()
  external override onlyNotPausedInvesting hardWorkers updateTotalAmount {
    // TODO belbix, lets review order of commands
    uint balance = IERC20(_underlying()).balanceOf(address(this));
    if (balance > 0) {
      _pumpIn(balance);
    }
    _rebalanceAllPipes();
    _claimFromAllPipes();
    autocompound();
  }

  /// @dev Stub function for Strategy Base implementation
  function depositToPool(uint256 underlyingAmount) internal override updateTotalAmount {
    _pumpIn(underlyingAmount);
  }

  /// @dev Function to withdraw from pool
  function withdrawAndClaimFromPool(uint256 underlyingAmount) internal override updateTotalAmount {
    _claimFromAllPipes();
    // update cached _totalAmount, and recalculate amount
    uint256 newTotalAmount = getTotalAmountOut();
    uint256 amount = underlyingAmount * newTotalAmount / _totalAmount;
    _pumpOutSource(amount, 0);
  }

  /// @dev Emergency withdraws all most underlying from the pool
  function emergencyWithdrawFromPool() internal override updateTotalAmount {
    _pumpOut(_getMostUnderlyingBalance(), 0);
  }

  /// @dev Liquidate all reward tokens
  //slither-disable-next-line dead-code
  function liquidateReward() internal override {
    liquidateRewardDefault();
  }

  /// @dev Returns how much tokens are ready to claim
  function readyToClaim() external view override returns (uint256[] memory) {
    uint256[] memory toClaim = new uint256[](_rewardTokens.length);
    return toClaim;
  }

  /// @dev Returns underlying pool total amount
  /// @dev Only for statistic
  function poolTotalAmount() external pure override returns (uint256) {
    // We may use few pools in the pipeline.
    // If you know what pool total amount you need for statistic purposes, you can override it in strategy implementation
    return 1;
    // for tests it now stubbed to 1
  }

  /// @dev Returns assets array
  function assets() external view override returns (address[] memory) {
    return _assets;
  }

  /// @dev Returns platform index
  function platform() external pure override returns (Platform) {
    return Platform.AAVE_MAI_BAL;
  }

  /// @dev Gets targetPercentage of MaiStablecoinPipe
  /// @return target collateral to debt percentage
  function targetPercentage() external view override returns (uint256) {
    return _maiStablecoinPipe.targetPercentage();
  }

  /// @dev Gets maxImbalance of MaiStablecoinPipe
  /// @return maximum imbalance (+/-%) to do re-balance
  function maxImbalance() external view override returns (uint256) {
    return _maiStablecoinPipe.maxImbalance();
  }

  /// @dev Gets collateralPercentage of MaiStablecoinPipe
  /// @return current collateral to debt percentage
  function collateralPercentage() external view override returns (uint256) {
    return _maiStablecoinPipe.collateralPercentage();
  }
  /// @dev Gets liquidationPrice of MaiStablecoinPipe
  /// @return price of source (am) token when vault will be liquidated
  function liquidationPrice() external view override returns (uint256 price) {
    uint256 camLiqPrice = _maiStablecoinPipe.liquidationPrice();
    // balance of amToken locked in camToken
    uint256 amBalance = IERC20(_maiCamPipe.sourceToken()).balanceOf(_maiCamPipe.outputToken());
    // camToken total supply
    uint256 totalSupply = IERC20Extended(_maiCamPipe.outputToken()).totalSupply();

    price = camLiqPrice * totalSupply / amBalance;
  }

  /// @dev Gets available MAI to borrow at the Mai Stablecoin contract. Should be checked at UI before deposit
  /// @return amToken maximum deposit
  function availableMai() external view override returns (uint256) {
    return _maiStablecoinPipe.availableMai();
  }

  /// @dev Returns maximal possible amToken deposit. Should be checked at UI before deposit
  /// @return max amToken maximum deposit
  function maxDeposit() external view override returns (uint256 max) {
    uint256 camMaxDeposit = _maiStablecoinPipe.maxDeposit();
    uint256 amBalance = IERC20(_maiCamPipe.sourceToken()).balanceOf(_maiCamPipe.outputToken());
    uint256 totalSupply = IERC20Extended(_maiCamPipe.outputToken()).totalSupply();
    max = camMaxDeposit * amBalance / totalSupply;
  }

  // ***************************************
  // ************** GOVERNANCE ACTIONS *****
  // ***************************************

  /// @notice Controller can claim coins that are somehow transferred into the contract
  ///         Note that they cannot come in take away coins that are used and defined in the strategy itself
  /// @param recipient Recipient address
  /// @param token Token address
  function salvageFromPipeline(address recipient, address token)
  external override onlyControllerOrGovernance updateTotalAmount {
    // transfers token to this contract
    _salvageFromAllPipes(recipient, token);
    emit SalvagedFromPipeline(recipient, token);
  }

  function rebalanceAllPipes() external override hardWorkers updateTotalAmount {
    _rebalanceAllPipes();
  }

  /// @dev Sets targetPercentage for MaiStablecoinPipe and re-balances all pipes
  /// @param _targetPercentage - target collateral to debt percentage
  function setTargetPercentage(uint256 _targetPercentage)
  external override onlyControllerOrGovernance updateTotalAmount {
    _maiStablecoinPipe.setTargetPercentage(_targetPercentage);
    emit SetTargetPercentage(_targetPercentage);
    _rebalanceAllPipes();
  }


  /// @dev Sets maxImbalance for maiStablecoinPipe and re-balances all pipes
  /// @param _maxImbalance - maximum imbalance deviation (+/-%)
  function setMaxImbalance(uint256 _maxImbalance)
  external override onlyControllerOrGovernance updateTotalAmount {
    _maiStablecoinPipe.setMaxImbalance(_maxImbalance);
    emit SetMaxImbalance(_maxImbalance);
    _rebalanceAllPipes();
  }

}
