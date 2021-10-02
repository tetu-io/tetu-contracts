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

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interface/ISmartVault.sol";
import "../interface/IFeeRewardForwarder.sol";
import "../interface/IBookkeeper.sol";
import "./Controllable.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";
import "./ForwarderStorage.sol";

/// @title Convert rewards from external projects to TETU and FundToken(USDC by default)
///        and send them to Profit Sharing pool, FundKeeper and vaults
///        After swap TETU tokens are deposited to the Profit Share pool and give xTETU tokens.
///        These tokens send to Vault as a reward for vesting (4 weeks).
///        If external rewards have a destination Profit Share pool
///        it is just sent to the contract as TETU tokens increasing share price.
/// @author belbix
contract FeeRewardForwarder is Controllable, IFeeRewardForwarder, ForwarderStorage {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ************ EVENTS **********************
  /// @notice Fee distributed to Profit Sharing pool
  event FeeMovedToPs(address indexed ps, address indexed token, uint256 amount);
  /// @notice Fee distributed to vault
  event FeeMovedToVault(address indexed vault, address indexed token, uint256 amount);
  /// @notice Fee distributed to FundKeeper
  event FeeMovedToFund(address indexed fund, address indexed token, uint256 amount);
  /// @notice Simple liquidation was done
  event Liquidated(address indexed tokenIn, address indexed tokenOut, uint256 amount);
  /// @notice Added or changed a route with routers
  event RouteAdded(address indexed tokenIn, address indexed tokenOut);

  /// @notice Initialize contract after setup it as proxy implementation
  /// @dev Use it only once after first logic setup
  ///      Initialize Controllable with sender address
  function initialize(address _controller) external initializer {
    Controllable.initializeControllable(_controller);
  }

  // ***************** VIEW ************************

  /// @notice Return Profit Sharing pool address
  /// @return Profit Sharing pool address
  function psVault() public view returns (address) {
    return IController(controller()).psVault();
  }

  /// @notice Return FundKeeper address
  /// @return FundKeeper address
  function fund() public view returns (address) {
    return IController(controller()).fund();
  }

  /// @notice Return Target token (TETU) address
  /// @return Target token (TETU) address
  function targetToken() public view returns (address) {
    return IController(controller()).rewardToken();
  }

  /// @notice Return a token address used for FundKeeper (USDC by default)
  /// @return FundKeeper's main token address (USDC by default)
  function fundToken() public view returns (address) {
    return IController(controller()).fundToken();
  }

  /// @notice Check a rout path and return true if valid
  /// @param _token Start token
  /// @param _targetToken Final token
  /// @return True if all fine
  function hasValidRoute(address _token, address _targetToken) public view returns (bool){
    return routes[_token][_targetToken].length > 1 // we need to convert token to targetToken
    && routers[_token][_targetToken].length != 0;
    // and route exist
  }

  /// @notice Check a rout path and return true if it has multiple routers
  /// @param _token Start token
  /// @param _targetToken Final token
  /// @return True if more than 1 router
  function isMultiRouter(address _token, address _targetToken) public view returns (bool){
    require(routers[_token][_targetToken].length != 0, "FRF: Invalid route");
    return routers[_token][_targetToken].length > 1;
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Only Governance or Controller can call it.
  ///         Call setConversionPath for each route of given array
  function setConversionPathMulti(address[][] memory _routes, address[][] memory _routers)
  external onlyControllerOrGovernance {
    require(_routes.length == _routers.length, "FRF: Wrong arrays");
    for (uint256 i = 0; i < _routes.length; i++) {
      setConversionPath(_routes[i], _routers[i]);
    }
  }

  /// @notice Only Governance or Controller can call it.
  ///         Sets the path for swapping tokens to the Target/Fund token address
  /// @param _route Array with tokens that need to swap where first
  ///               is external project reward and final is Target/Fund token
  /// @param _routers Swap platform routers. 1 for each swap operation in the route
  function setConversionPath(address[] memory _route, address[] memory _routers)
  public onlyControllerOrGovernance {
    require(_routers.length == 1 ||
      (_route.length != 0 && _routers.length == _route.length.sub(1)), "FRF: Wrong data");
    address from = _route[0];
    address to = _route[_route.length - 1];
    routes[from][to] = _route;
    routers[from][to] = _routers;
    emit RouteAdded(from, to);
  }

  // ***************** EXTERNAL *******************************

  /// @notice Only Reward Distributor or Governance or Controller can call it.
  ///         Distribute rewards for given vault, move fees to PS and Fund
  ///         Under normal circumstances, sender is the strategy
  /// @param _amount Amount of tokens for distribute
  /// @param _token Token for distribute
  /// @param _vault Target vault
  /// @return Amount of distributed Target(TETU) tokens + FundKeeper fee (approx)
  function distribute(uint256 _amount, address _token, address _vault) public override onlyRewardDistribution returns (uint256){
    require(_amount != 0, "FRF: Zero amount for distribute");

    uint256 profitSharingNumerator = IController(controller()).psNumerator();
    uint256 profitSharingDenominator = IController(controller()).psDenominator();

    uint256 toPsAmount = _amount.mul(profitSharingNumerator).div(profitSharingDenominator);
    uint256 toVaultAmount = _amount.sub(toPsAmount);

    uint256 targetTokenDistributed = 0;
    if (toPsAmount > 0) {
      targetTokenDistributed = targetTokenDistributed.add(
        notifyPsPool(_token, toPsAmount)
      );
    }
    if (toVaultAmount > 0) {
      targetTokenDistributed = targetTokenDistributed.add(
        notifyCustomPool(_token, _vault, toVaultAmount)
      );
    }

    return plusFundAmountToDistributedAmount(targetTokenDistributed);
  }

  /// @notice Liquidate the token amount and send to the Profit Sharing pool.
  ///         Under normal circumstances, sender is the strategy
  /// @param _token Token for liquidation
  /// @param _amount Amount of token for liquidation
  /// @return Amount of distributed Target(TETU) tokens
  function notifyPsPool(address _token, uint256 _amount) public override onlyRewardDistribution returns (uint256) {
    require(targetToken() != address(0), "FRF: Target token is zero for notify");

    uint256 toFund = toFundAmount(_amount);
    sendToFund(_token, toFund);
    uint256 toPs = _amount.sub(toFund);

    uint256 amountToSend = liquidateTokenForTargetToken(_token, toPs, targetToken());

    require(amountToSend > 0, "FRF: Liquidation path not found for target token");

    IERC20(targetToken()).safeTransfer(psVault(), amountToSend);
    uint256 ppfs = ISmartVault(psVault()).getPricePerFullShare();
    IBookkeeper(IController(controller()).bookkeeper()).registerPpfsChange(psVault(), ppfs);
    emit FeeMovedToPs(psVault(), targetToken(), amountToSend);

    return amountToSend;
  }

  /// @notice Liquidate the token amount and send to the given vault.
  ///         Under normal circumstances, sender is the strategy
  /// @param _token Token for liquidation
  /// @param _amount Amount of token for liquidation
  /// @param _rewardPool Vault address
  /// @return Amount of distributed Target(TETU) tokens
  function notifyCustomPool(address _token, address _rewardPool, uint256 _amount)
  public override onlyRewardDistribution returns (uint256) {
    require(targetToken() != address(0), "FRF: Target token is zero");

    address psToken = psVault();
    ISmartVault smartVault = ISmartVault(_rewardPool);
    require(smartVault.getRewardTokenIndex(psToken) != type(uint256).max,
      "FRF: psToken not added to vault");

    uint256 toFund = toFundAmount(_amount);
    sendToFund(_token, toFund);
    uint256 toVault = _amount.sub(toFund);

    // if liquidation path exist liquidate to the target token
    uint256 targetTokenBalance = liquidateTokenForTargetToken(_token, toVault, targetToken());

    require(targetTokenBalance > 0, "FRF: Liquidation path not found for target token");

    IERC20(targetToken()).safeApprove(psVault(), targetTokenBalance);
    ISmartVault(psVault()).deposit(targetTokenBalance);
    uint256 amountToSend = IERC20(psToken).balanceOf(address(this));
    IERC20(psToken).safeApprove(_rewardPool, amountToSend);
    smartVault.notifyRewardWithoutPeriodChange(psToken, amountToSend);
    emit FeeMovedToVault(_rewardPool, psToken, amountToSend);
    return targetTokenBalance;
  }

  /// @dev Simple function for liquidate and send back the given token
  ///      No strict access
  function liquidate(address tokenIn, address tokenOut, uint256 amount)
  external override returns (uint256) {
    if (tokenIn == tokenOut) {
      // no action required if the same token;
      return amount;
    }
    require(amount != 0, "FRF: Zero amount got liquidation");
    uint256 resultAmount = liquidateTokenForTargetToken(tokenIn, amount, tokenOut);
    require(resultAmount > 0, "FRF: Liquidation path not found");
    IERC20(tokenOut).safeTransfer(msg.sender, resultAmount);
    emit Liquidated(tokenIn, tokenOut, amount);
    return resultAmount;
  }

  //************************* INTERNAL **************************

  /// @dev Sell given token for FunTOken and send to FundKeeper
  /// @param _token Token address
  /// @param _amount Token amount
  function sendToFund(address _token, uint256 _amount) internal {
    // no actions if we don't have a fee for fund
    if (_amount == 0) {
      return;
    }
    require(fundToken() != address(0), "FRF: Fund token is zero");
    require(fund() != address(0), "FRF: Fund is zero");

    uint256 amountToSend = liquidateTokenForTargetToken(_token, _amount, fundToken());

    require(amountToSend > 0, "FRF: No liq path for fund token");

    IERC20(fundToken()).safeTransfer(fund(), amountToSend);

    IBookkeeper(IController(controller()).bookkeeper())
    .registerFundKeeperEarned(fundToken(), amountToSend);
    emit FeeMovedToFund(fund(), fundToken(), amountToSend);
  }

  /// @dev Compute amount for FundKeeper based on Fund ratio from Controller
  /// @param _amount 100% Amount
  /// @return Percent of total amount
  function toFundAmount(uint256 _amount) internal view returns (uint256) {
    uint256 fundNumerator = IController(controller()).fundNumerator();
    uint256 fundDenominator = IController(controller()).fundDenominator();
    return _amount.mul(fundNumerator).div(fundDenominator);
  }

  /// @dev Compute Approximate Total amount normalized to TETU token
  /// @param _amount Amount of TETU token distributed to PS and Vault
  /// @return Approximate Total amount normalized to TETU token
  function plusFundAmountToDistributedAmount(uint256 _amount) internal view returns (uint256) {
    uint256 fundNumerator = IController(controller()).fundNumerator();
    uint256 fundDenominator = IController(controller()).fundDenominator();
    uint256 toDistributeNumerator = fundDenominator.sub(fundNumerator);
    return _amount.mul(toDistributeNumerator).div(fundDenominator);
  }

  /// @dev Sell given token for given Target token (TETU or Fund token)
  /// @param _token Token for liquidation
  /// @param _amount Amount for liquidation
  /// @param _targetToken Target token (TETU or Fund token)
  /// @return Target token balance after liquidation
  function liquidateTokenForTargetToken(address _token, uint256 _amount, address _targetToken)
  internal returns (uint256) {
    if (_token == _targetToken) {
      // this is already the right token
      // move reward to this contract
      IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
      return IERC20(_targetToken).balanceOf(address(this));
    } else if (hasValidRoute(_token, _targetToken)) {
      // move reward to this contract
      IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
      //liquidate depends on routers count
      if (isMultiRouter(_token, _targetToken)) {
        liquidateMultiRouter(_token, _amount, _targetToken);
      } else {
        liquidate(_token, _amount, _targetToken);
      }
      return IERC20(_targetToken).balanceOf(address(this));
    }
    // in case when it is unknown token and we don't have a router
    // don't transfer tokens to this contracts
    return 0;
  }

  /// @dev Choose liquidation path for `_from` token to `_targetToken` and make swap
  /// @param _from Start token
  /// @param balanceToSwap Amount for swapping
  /// @param _targetToken Final destination for swap
  function liquidate(address _from, uint256 balanceToSwap, address _targetToken) internal {
    if (balanceToSwap > 0) {
      address router = routers[_from][_targetToken][0];
      swap(router, routes[_from][_targetToken], balanceToSwap);
    }
  }

  /// @dev Choose liquidation path for `_from` token to `_targetToken` and make swap for each router
  /// @param _from Start token
  /// @param balanceToSwap Amount for swapping
  /// @param _targetToken Final destination for swap
  function liquidateMultiRouter(address _from, uint256 balanceToSwap, address _targetToken) internal {
    if (balanceToSwap > 0) {
      address[] memory _routers = routers[_from][_targetToken];
      address[] memory _route = routes[_from][_targetToken];
      for (uint256 i = 0; i < _routers.length; i++) {
        address router = _routers[i];
        address[] memory route = new address[](2);
        route[0] = _route[i];
        route[1] = _route[i + 1];
        uint256 amount = IERC20(route[0]).balanceOf(address(this));
        swap(router, route, amount);
      }
    }
  }

  /// @dev https://uniswap.org/docs/v2/smart-contracts/router02/#swapexacttokensfortokens
  ///      this function can get INSUFFICIENT_INPUT_AMOUNT if we have too low amount of reward
  ///      it is fine and should rollback the doHardWork call
  /// @param _router Uniswap router address
  /// @param _route Path for swap
  /// @param _amount Amount for swap
  function swap(address _router, address[] memory _route, uint256 _amount) internal {
    IERC20(_route[0]).safeApprove(_router, 0);
    IERC20(_route[0]).safeApprove(_router, _amount);
    //slither-disable-next-line unused-return
    IUniswapV2Router02(_router).swapExactTokensForTokens(
      _amount,
      0,
      _route,
      address(this),
      block.timestamp
    );
  }
}
