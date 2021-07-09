// SPDX-License-Identifier: Unlicense

pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "../interface/ISmartVault.sol";
import "../interface/IFeeRewardForwarder.sol";
import "../interface/IBookkeeper.sol";
import "./Controllable.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";

contract FeeRewardForwarder is IFeeRewardForwarder, Controllable {
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // ************ EVENTS **********************
  event FeeMovedToGovernance(address governance, address token, uint256 amount);
  event FeeMovedToPs(address ps, address token, uint256 amount);
  event FeeMovedToVault(address vault, address token, uint256 amount);

  // ************ VARIABLES **********************
  string public constant VERSION = "0";

  mapping(address => mapping(address => address[])) public routes;
  mapping(address => mapping(address => address[])) public routers;

  constructor(address _controller) {
    Controllable.initializeControllable(_controller);
  }

  // ***************** VIEW ************************

  function psVault() public view returns (address) {
    return IController(controller()).psVault();
  }

  // the targeted reward token to convert everything to
  function targetToken() public view returns (address) {
    return IController(controller()).rewardToken();
  }

  function hasValidRoute(address _token) public view returns (bool){
    return routes[_token][targetToken()].length > 1 // we need to convert token to targetToken
    && routers[_token][targetToken()].length != 0;
    // and route exist
  }

  function isMultiRouter(address _token) public view returns (bool){
    require(routers[_token][targetToken()].length != 0, "invalid route");
    return routers[_token][targetToken()].length > 1;
  }

  // ************ GOVERNANCE ACTIONS **************************
  /**
  * Sets the path for swapping tokens to the to address
  */
  function setConversionPath(address[] memory _route, address[] memory _routers)
  public
  onlyControllerOrGovernance
  {
    require(
      _routers.length == 1 || _routers.length == _route.length - 1, "wrong data");
    address from = _route[0];
    address to = _route[_route.length - 1];
    require(to == targetToken(), "wrong to");
    routes[from][to] = _route;
    routers[from][to] = _routers;
  }

  // ***************** EXTERNAL *******************************

  // Transfers the funds from the msg.sender to the pool
  // under normal circumstances, msg.sender is the strategy
  function notifyPsPool(address _token, uint256 _amount) public override onlyRewardDistribution returns (uint256) {
    require(targetToken() != address(0), "target token is zero");

    uint256 amountToSend = liquidateTokenForTargetToken(_token, _amount);

    require(amountToSend > 0, "no liq path");

    IERC20(targetToken()).safeTransfer(psVault(), amountToSend);
    uint256 ppfs = ISmartVault(psVault()).getPricePerFullShare();
    IBookkeeper(IController(controller()).bookkeeper()).registerPpfsChange(psVault(), ppfs);
    emit FeeMovedToPs(psVault(), targetToken(), amountToSend);

    return amountToSend;
  }

  /**
  * Notifies a given _rewardPool with _maxBuyback by converting it into Target Token
  */
  function notifyCustomPool(address _token, address _rewardPool, uint256 _amount)
  public override onlyRewardDistribution returns (uint256) {
    require(targetToken() != address(0), "target token is zero");

    address psToken = psVault();
    ISmartVault smartVault = ISmartVault(_rewardPool);
    require(smartVault.getRewardTokenIndex(psToken) != uint256(- 1), "psToken not added to vault");

    // if liquidation path exist liquidate to the target token
    uint256 targetTokenBalance = liquidateTokenForTargetToken(_token, _amount);

    require(targetTokenBalance > 0, "no liq path");

    IERC20(targetToken()).approve(psVault(), targetTokenBalance);
    ISmartVault(psVault()).deposit(targetTokenBalance);
    uint256 amountToSend = IERC20(psToken).balanceOf(address(this));
    IERC20(psToken).approve(_rewardPool, amountToSend);
    smartVault.notifyTargetRewardAmount(psToken, amountToSend);
    emit FeeMovedToVault(_rewardPool, psToken, amountToSend);
    return targetTokenBalance;
  }

  //************************* INTERNAL **************************

  function liquidateTokenForTargetToken(address _token, uint256 _amount)
  internal returns (uint256) {

    if (_token == targetToken()) {
      // this is already the right token
      // move reward to this contract
      IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
      return IERC20(targetToken()).balanceOf(address(this));
    } else if (hasValidRoute(_token)) {
      // move reward to this contract
      IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
      // get balance for reason we can have manually sent reward tokens
      uint256 balanceToSwap = IERC20(_token).balanceOf(address(this));
      //liquidate depends on routers count
      if (isMultiRouter(_token)) {
        liquidateMultiRouter(_token, balanceToSwap);
      } else {
        liquidate(_token, balanceToSwap);
      }
      return IERC20(targetToken()).balanceOf(address(this));
    }
    // in case when it is unknown token and we don't have a router
    // don't transfer tokens to this contracts
    return 0;
  }

  function liquidate(address _from, uint256 balanceToSwap) internal {
    if (balanceToSwap > 0) {
      address router = routers[_from][targetToken()][0];
      swap(router, routes[_from][targetToken()], balanceToSwap);
    }
  }

  function liquidateMultiRouter(address _from, uint256 balanceToSwap) internal {
    if (balanceToSwap > 0) {
      address[] memory _routers = routers[_from][targetToken()];
      address[] memory _route = routes[_from][targetToken()];
      for (uint256 i; i < _routers.length; i++) {
        address router = _routers[i];
        address[] memory route = new address[](2);
        route[0] = _route[i];
        route[1] = _route[i + 1];
        uint256 amount = IERC20(route[0]).balanceOf(address(this));
        swap(router, route, amount);
      }
    }
  }

  // https://uniswap.org/docs/v2/smart-contracts/router02/#swapexacttokensfortokens
  // this function can get INSUFFICIENT_INPUT_AMOUNT if we have too low amount of reward
  // it is fine and should rollback the doHardWork call
  function swap(address _router, address[] memory _route, uint256 _amount) internal {
    IERC20(_route[0]).safeApprove(_router, 0);
    IERC20(_route[0]).safeApprove(_router, _amount);
    IUniswapV2Router02(_router).swapExactTokensForTokens(
      _amount,
      0,
      _route,
      address(this),
      block.timestamp
    );
  }
}
