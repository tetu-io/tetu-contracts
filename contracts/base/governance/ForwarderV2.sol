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
import "../interface/ISmartVault.sol";
import "../interface/IFeeRewardForwarder.sol";
import "../interface/IBookkeeper.sol";
import "./Controllable.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";
import "../../third_party/uniswap/IUniswapV2Factory.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";
import "./ForwarderV2Storage.sol";

/// @title Convert rewards from external projects to TETU and FundToken(USDC by default)
///        and send them to Profit Sharing pool, FundKeeper and vaults
///        After swap TETU tokens are deposited to the Profit Share pool and give xTETU tokens.
///        These tokens send to Vault as a reward for vesting (4 weeks).
///        If external rewards have a destination Profit Share pool
///        it is just sent to the contract as TETU tokens increasing share price.
/// @author belbix
contract ForwarderV2 is Controllable, IFeeRewardForwarder, ForwarderV2Storage {
  using SafeERC20 for IERC20;

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.2.3";
  uint256 public constant LIQUIDITY_DENOMINATOR = 100;
  uint constant public DEFAULT_UNI_FEE_DENOMINATOR = 1000;
  uint constant public DEFAULT_UNI_FEE_NUMERATOR = 997;
  uint constant public ROUTE_LENGTH_MAX = 5;
  uint constant public SLIPPAGE_DENOMINATOR = 100;
  uint constant public MINIMUM_AMOUNT = 100;

  // ************ EVENTS **********************
  /// @notice Fee distributed to Profit Sharing pool
  event FeeMovedToPs(address indexed ps, address indexed token, uint256 amount);
  /// @notice Fee distributed to vault
  event FeeMovedToVault(address indexed vault, address indexed token, uint256 amount);
  /// @notice Fee distributed to FundKeeper
  event FeeMovedToFund(address indexed fund, address indexed token, uint256 amount);
  /// @notice Simple liquidation was done
  event Liquidated(address indexed tokenIn, address indexed tokenOut, uint256 amount);
  event LiquidityAdded(
    address router,
    address token0,
    uint256 token0Amount,
    address token1,
    uint256 token1Amount
  );

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
  function tetu() public view returns (address) {
    return IController(controller()).rewardToken();
  }

  /// @notice Return a token address used for FundKeeper (USDC by default)
  /// @return FundKeeper's main token address (USDC by default)
  function fundToken() public view returns (address) {
    return IController(controller()).fundToken();
  }

  /// @notice Return slippage numerator
  function slippageNumerator() public view returns (uint) {
    return _slippageNumerator();
  }


  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Only Governance or Controller can call it.
  ///         Add a pair with largest TVL for given token
  function addLargestLps(address[] memory _tokens, address[] memory _lps) external onlyControllerOrGovernance {
    require(_tokens.length == _lps.length, "F2: Wrong arrays");
    for (uint i = 0; i < _lps.length; i++) {
      IUniswapV2Pair lp = IUniswapV2Pair(_lps[i]);
      address oppositeToken;
      if (lp.token0() == _tokens[i]) {
        oppositeToken = lp.token1();
      } else if (lp.token1() == _tokens[i]) {
        oppositeToken = lp.token0();
      } else {
        revert("F2: Wrong LP");
      }
      largestLps[_tokens[i]] = LpData(address(lp), _tokens[i], oppositeToken);
    }
  }

  /// @notice Only Governance or Controller can call it.
  ///         Add largest pairs with the most popular tokens on the current network
  function addBlueChipsLps(address[] memory _lps) external onlyControllerOrGovernance {
    for (uint i = 0; i < _lps.length; i++) {
      IUniswapV2Pair lp = IUniswapV2Pair(_lps[i]);
      blueChipsLps[lp.token0()][lp.token1()] = LpData(address(lp), lp.token0(), lp.token1());
      blueChipsLps[lp.token1()][lp.token0()] = LpData(address(lp), lp.token0(), lp.token1());
      blueChipsTokens[lp.token0()] = true;
      blueChipsTokens[lp.token1()] = true;
    }
  }

  /// @notice Only Governance or Controller can call it.
  ///         Sets numerator for a part of profit that goes instead of PS to TETU liquidity
  function setLiquidityNumerator(uint256 _value) external onlyControllerOrGovernance {
    require(_value <= LIQUIDITY_DENOMINATOR, "F2: Too high value");
    _setLiquidityNumerator(_value);
  }

  /// @notice Only Governance or Controller can call it.
  ///         Sets numerator for slippage value. Must be in a range 0-100
  function setSlippageNumerator(uint256 _value) external onlyControllerOrGovernance {
    require(_value <= SLIPPAGE_DENOMINATOR, "F2: Too high value");
    _setSlippageNumerator(_value);
  }

  /// @notice Only Governance or Controller can call it.
  ///         Sets router for a pair with TETU liquidity
  function setLiquidityRouter(address _value) external onlyControllerOrGovernance {
    _setLiquidityRouter(_value);
  }

  /// @notice Only Governance or Controller can call it.
  ///         Sets specific Swap fee for given factory
  function setUniPlatformFee(address _factory, uint _feeNumerator, uint _feeDenominator) external onlyControllerOrGovernance {
    require(_factory != address(0), "F2: Zero factory");
    require(_feeNumerator <= _feeDenominator, "F2: Wrong values");
    require(_feeDenominator != 0, "F2: Wrong denominator");
    uniPlatformFee[_factory] = UniFee(_feeNumerator, _feeDenominator);
  }

  // ***************** EXTERNAL *******************************

  /// @notice Only Reward Distributor or Governance or Controller can call it.
  ///         Distribute rewards for given vault, move fees to PS and Fund
  ///         Under normal circumstances, sender is the strategy
  /// @param _amount Amount of tokens for distribute
  /// @param _token Token for distribute
  /// @param _vault Target vault
  /// @return Amount of distributed Target(TETU) tokens + FundKeeper fee (approx)
  function distribute(
    uint256 _amount,
    address _token,
    address _vault
  ) public override onlyRewardDistribution returns (uint256){
    require(fundToken() != address(0), "F2: Fund token is zero");
    require(_amount != 0, "F2: Zero amount for distribute");
    IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

    // don't spend gas for garbage
    if (_amount < MINIMUM_AMOUNT) {
      return 0;
    }

    // calculate require amounts
    uint toFund = _toFundAmount(_amount);
    uint toPsAndLiq = _toPsAndLiqAmount(_amount - toFund);
    uint toLiq = _toTetuLiquidityAmount(toPsAndLiq);
    uint toLiqFundTokenPart = toLiq / 2;
    uint toLiqTetuTokenPart = toLiq - toLiqFundTokenPart;
    uint toPs = toPsAndLiq - toLiq;
    uint toVault = _amount - toFund - toPsAndLiq;

    uint fundTokenRequires = toFund + toLiqFundTokenPart;
    uint tetuTokenRequires = toLiqTetuTokenPart + toPs + toVault;
    require(fundTokenRequires + tetuTokenRequires == _amount, "F2: Wrong amount sum");


    uint fundTokenAmount = _liquidate(_token, fundToken(), fundTokenRequires);
    uint sentToFund = _sendToFund(fundTokenAmount, toFund, toLiqFundTokenPart);

    uint tetuTokenAmount = _liquidate(_token, tetu(), tetuTokenRequires);

    uint256 tetuDistributed = 0;
    if (toPsAndLiq > MINIMUM_AMOUNT && fundTokenAmount > sentToFund) {
      tetuDistributed += _sendToPsAndLiquidity(
        tetuTokenAmount,
        toLiqTetuTokenPart,
        toPs,
        toVault,
        fundTokenAmount - sentToFund
      );
    }
    if (toVault > MINIMUM_AMOUNT) {
      tetuDistributed += _sendToVault(
        _vault,
        tetuTokenAmount,
        toLiqTetuTokenPart,
        toPs,
        toVault
      );
    }

    _sendExcessTokens();
    return _plusFundAmountToDistributedAmount(tetuDistributed);
  }

  /// @dev Simple function for liquidate and send back the given token
  ///      No strict access
  function liquidate(address tokenIn, address tokenOut, uint256 amount) external override returns (uint256) {
    if (tokenIn == tokenOut) {
      // no action required if the same token;
      return amount;
    }
    if (amount == 0) {
      return 0;
    }
    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);
    uint256 resultAmount = _liquidate(tokenIn, tokenOut, amount);
    require(resultAmount > 0, "F2: Liquidated with zero result");
    IERC20(tokenOut).safeTransfer(msg.sender, resultAmount);
    emit Liquidated(tokenIn, tokenOut, amount);
    return resultAmount;
  }

  /// @dev We don't need this function anymore, keep for compatibility
  function notifyPsPool(address, uint256) external pure override returns (uint256) {
    revert("F2: Directly notifyPsPool not implemented");
  }

  /// @dev We don't need this function anymore, keep for compatibility
  function notifyCustomPool(address, address, uint256) external pure override returns (uint256) {
    revert("F2: Directly notifyCustomPool not implemented");
  }


  //************************* INTERNAL **************************

  function _sendExcessTokens() internal {
    uint excessFundToken = IERC20(fundToken()).balanceOf(address(this));
    if (excessFundToken > MINIMUM_AMOUNT && fund() != address(0)) {
      IERC20(fundToken()).safeTransfer(fund(), excessFundToken);
      IBookkeeper(IController(controller()).bookkeeper())
      .registerFundKeeperEarned(fundToken(), excessFundToken);
      emit FeeMovedToFund(fund(), fundToken(), excessFundToken);
    }

    uint excessTetuToken = IERC20(tetu()).balanceOf(address(this));
    if (excessTetuToken > MINIMUM_AMOUNT) {
      IERC20(tetu()).safeTransfer(psVault(), excessTetuToken);
      emit FeeMovedToPs(psVault(), tetu(), excessTetuToken);
    }
  }

  function _sendToPsAndLiquidity(
    uint tetuTokenAmount,
    uint baseToLiqTetuTokenPart,
    uint baseToPs,
    uint baseToVault,
    uint toLiqFundTokenPart
  ) internal returns (uint) {
    uint baseSum = baseToLiqTetuTokenPart + baseToPs + baseToVault;

    uint toLiqTetuTokenPart = tetuTokenAmount * baseToLiqTetuTokenPart / baseSum;
    uint tetuLiqAmount = _sendToLiquidity(toLiqTetuTokenPart, toLiqFundTokenPart);

    uint toPs = tetuTokenAmount * baseToPs / baseSum;
    if (toPs > MINIMUM_AMOUNT) {
      IERC20(tetu()).safeTransfer(psVault(), toPs);
      emit FeeMovedToPs(psVault(), tetu(), toPs);
    }
    return toPs + tetuLiqAmount;
  }

  function _sendToVault(
    address _vault,
    uint tetuTokenAmount,
    uint baseToLiqTetuTokenPart,
    uint baseToPs,
    uint baseToVault
  ) internal returns (uint256) {
    address xTetu = psVault();
    ISmartVault smartVault = ISmartVault(_vault);
    address[] memory rts = smartVault.rewardTokens();
    require(rts.length > 0, "F2: No reward tokens");
    address rt = rts[0];

    uint baseSum = baseToLiqTetuTokenPart + baseToPs + baseToVault;
    uint toVault = tetuTokenAmount * baseToVault / baseSum;
    // no actions if little amount
    if (toVault < MINIMUM_AMOUNT) {
      return 0;
    }

    uint256 amountToSend;
    if (rt == xTetu) {
      uint rtBalanceBefore = IERC20(xTetu).balanceOf(address(this));
      IERC20(tetu()).safeApprove(psVault(), toVault);
      ISmartVault(psVault()).deposit(toVault);
      amountToSend = IERC20(xTetu).balanceOf(address(this)) - rtBalanceBefore;
    } else if (rt == tetu()) {
      amountToSend = toVault;
    } else {
      revert("F2: First reward token not TETU nor xTETU");
    }

    IERC20(rt).safeApprove(_vault, amountToSend);
    smartVault.notifyTargetRewardAmount(rt, amountToSend);
    emit FeeMovedToVault(_vault, rt, amountToSend);
    return toVault;
  }

  function _sendToFund(uint256 fundTokenAmount, uint baseToFundAmount, uint baseToLiqFundTokenPart) internal returns (uint){
    uint toFund = fundTokenAmount * baseToFundAmount / (baseToFundAmount + baseToLiqFundTokenPart);

    // no actions if we don't have a fee for fund
    if (toFund == 0) {
      return 0;
    }
    require(fund() != address(0), "F2: Fund is zero");

    IERC20(fundToken()).safeTransfer(fund(), toFund);

    IBookkeeper(IController(controller()).bookkeeper())
    .registerFundKeeperEarned(fundToken(), toFund);
    emit FeeMovedToFund(fund(), fundToken(), toFund);
    return toFund;
  }

  function _sendToLiquidity(uint toLiqTetuTokenPart, uint toLiqFundTokenPart) internal returns (uint256) {
    // no actions if we don't have a fee for liquidity
    if (toLiqTetuTokenPart < MINIMUM_AMOUNT || toLiqFundTokenPart < MINIMUM_AMOUNT) {
      return 0;
    }

    uint256 lpAmount = _addLiquidity(
      liquidityRouter(),
      fundToken(),
      tetu(),
      toLiqFundTokenPart,
      toLiqTetuTokenPart
    );

    require(lpAmount != 0, "F2: Liq: Zero LP amount");

    address liquidityPair = IUniswapV2Factory(IUniswapV2Router02(liquidityRouter()).factory())
    .getPair(fundToken(), tetu());

    IERC20(liquidityPair).safeTransfer(fund(), lpAmount);
    return toLiqTetuTokenPart * 2;
  }

  /// @dev Compute amount for FundKeeper based on Fund ratio from Controller
  /// @param _amount 100% Amount
  /// @return Percent of total amount
  function _toFundAmount(uint256 _amount) internal view returns (uint256) {
    uint256 fundNumerator = IController(controller()).fundNumerator();
    uint256 fundDenominator = IController(controller()).fundDenominator();
    return _amount * fundNumerator / fundDenominator;
  }

  /// @dev Compute amount for Profit Sharing vault based Controller settings
  /// @param _amount 100% Amount
  /// @return Percent of total amount
  function _toPsAndLiqAmount(uint _amount) internal view returns (uint) {
    uint256 psNumerator = IController(controller()).psNumerator();
    uint256 psDenominator = IController(controller()).psDenominator();
    return _amount * psNumerator / psDenominator;
  }

  /// @dev Compute amount for TETU liquidity
  function _toTetuLiquidityAmount(uint256 _amount) internal view returns (uint256) {
    return _amount * liquidityNumerator() / LIQUIDITY_DENOMINATOR;
  }

  /// @dev Compute Approximate Total amount normalized to TETU token
  /// @param _amount Amount of TETU token distributed to PS and Vault
  /// @return Approximate Total amount normalized to TETU token
  function _plusFundAmountToDistributedAmount(uint256 _amount) internal view returns (uint256) {
    uint256 fundNumerator = IController(controller()).fundNumerator();
    uint256 fundDenominator = IController(controller()).fundDenominator();
    return _amount * fundDenominator / (fundDenominator - fundNumerator);
  }

  /// @dev Swap one token to another using all available amount
  function _liquidate(address _tokenIn, address _tokenOut, uint256 _amount) internal returns (uint256) {
    if (_tokenIn == _tokenOut) {
      // this is already the right token
      return _amount;
    }
    (LpData[] memory route, uint count) = _createLiquidationRoute(_tokenIn, _tokenOut);

    uint outBalance = _amount;
    for (uint i = 0; i < count; i++) {
      LpData memory lpData = route[i];
      uint outBalanceBefore = IERC20(lpData.oppositeToken).balanceOf(address(this));
      _swap(lpData.token, lpData.oppositeToken, IUniswapV2Pair(lpData.lp), outBalance);
      outBalance = IERC20(lpData.oppositeToken).balanceOf(address(this)) - outBalanceBefore;
    }
    return outBalance;
  }

  function _createLiquidationRoute(address _tokenIn, address _tokenOut) internal view returns (LpData[] memory, uint)  {
    LpData[] memory route = new LpData[](ROUTE_LENGTH_MAX);
    // in case that we try to liquidate blue chips use bc lps directly
    LpData memory lpDataBC = blueChipsLps[_tokenIn][_tokenOut];
    if (lpDataBC.lp != address(0)) {
      lpDataBC.token = _tokenIn;
      lpDataBC.oppositeToken = _tokenOut;
      route[0] = lpDataBC;
      return (route, 1);
    }

    // find the best LP for token IN
    LpData memory lpDataIn = largestLps[_tokenIn];
    require(lpDataIn.lp != address(0), "F2: not found LP for tokenIn");
    route[0] = lpDataIn;
    // if the best LP for token IN a pair with token OUT token we complete the route
    if (lpDataIn.oppositeToken == _tokenOut) {
      return (route, 1);
    }

    // if we able to swap opposite token to a blue chip it is the cheaper way to liquidate
    lpDataBC = blueChipsLps[lpDataIn.oppositeToken][_tokenOut];
    if (lpDataBC.lp != address(0)) {
      lpDataBC.token = lpDataIn.oppositeToken;
      lpDataBC.oppositeToken = _tokenOut;
      route[1] = lpDataBC;
      return (route, 2);
    }

    // find the largest LP for token out
    LpData memory lpDataOut = largestLps[_tokenOut];
    require(lpDataIn.lp != address(0), "F2: not found LP for tokenOut");
    // if we can swap between largest LPs the route is ended
    if (lpDataIn.oppositeToken == lpDataOut.oppositeToken) {
      lpDataOut.oppositeToken = lpDataOut.token;
      lpDataOut.token = lpDataIn.oppositeToken;
      route[1] = lpDataOut;
      return (route, 2);
    }

    // if we able to swap opposite token to a blue chip it is the cheaper way to liquidate
    lpDataBC = blueChipsLps[lpDataIn.oppositeToken][lpDataOut.oppositeToken];
    if (lpDataBC.lp != address(0)) {
      lpDataBC.token = lpDataIn.oppositeToken;
      lpDataBC.oppositeToken = lpDataOut.oppositeToken;
      route[1] = lpDataBC;
      lpDataOut.oppositeToken = lpDataOut.token;
      lpDataOut.token = lpDataBC.oppositeToken;
      route[2] = lpDataOut;
      return (route, 3);
    }

    LpData memory lpDataInMiddle;
    // this case only for a token with specific opposite token in a pair
    if (!blueChipsTokens[lpDataIn.oppositeToken]) {

      // some tokens have primary liquidity with specific token
      // need to find a liquidity for them
      lpDataInMiddle = largestLps[lpDataIn.oppositeToken];
      require(lpDataInMiddle.lp != address(0), "F2: not found LP for middle in");
      route[1] = lpDataInMiddle;
      if (lpDataInMiddle.oppositeToken == _tokenOut) {
        return (route, 2);
      }

      // if we able to swap opposite token to a blue chip it is the cheaper way to liquidate
      lpDataBC = blueChipsLps[lpDataInMiddle.oppositeToken][_tokenOut];
      if (lpDataBC.lp != address(0)) {
        lpDataBC.token = lpDataInMiddle.oppositeToken;
        lpDataBC.oppositeToken = _tokenOut;
        route[2] = lpDataBC;
        return (route, 3);
      }

      // if we able to swap opposite token to a blue chip it is the cheaper way to liquidate
      lpDataBC = blueChipsLps[lpDataInMiddle.oppositeToken][lpDataOut.oppositeToken];
      if (lpDataBC.lp != address(0)) {
        lpDataBC.token = lpDataInMiddle.oppositeToken;
        lpDataBC.oppositeToken = lpDataOut.oppositeToken;
        route[2] = lpDataBC;
        (lpDataOut.oppositeToken, lpDataOut.token) = (lpDataOut.token, lpDataOut.oppositeToken);
        route[3] = lpDataOut;
        return (route, 4);
      }

    }


    // if we don't have pair for token out try to find a middle lp
    // it needs for cases where tokenOut has a pair with specific token
    LpData memory lpDataOutMiddle = largestLps[lpDataOut.oppositeToken];
    require(lpDataOutMiddle.lp != address(0), "F2: not found LP for middle out");
    // even if we found lpDataInMiddle we have shorter way
    if (lpDataOutMiddle.oppositeToken == lpDataIn.oppositeToken) {
      (lpDataOutMiddle.oppositeToken, lpDataOutMiddle.token) = (lpDataOutMiddle.token, lpDataOutMiddle.oppositeToken);
      route[1] = lpDataOutMiddle;
      return (route, 2);
    }

    // tokenIn has not pair with bluechips
    if (lpDataInMiddle.lp != address(0)) {
      lpDataBC = blueChipsLps[lpDataInMiddle.oppositeToken][lpDataOutMiddle.oppositeToken];
      if (lpDataBC.lp != address(0)) {
        lpDataBC.token = lpDataInMiddle.oppositeToken;
        lpDataBC.oppositeToken = lpDataOutMiddle.oppositeToken;
        route[2] = lpDataBC;
        (lpDataOutMiddle.oppositeToken, lpDataOutMiddle.token) = (lpDataOutMiddle.token, lpDataOutMiddle.oppositeToken);
        route[3] = lpDataOutMiddle;
        (lpDataOut.oppositeToken, lpDataOut.token) = (lpDataOut.token, lpDataOut.oppositeToken);
        route[4] = lpDataOut;
        return (route, 5);
      }
    } else {
      // tokenIn has pair with bluechips
      lpDataBC = blueChipsLps[lpDataIn.oppositeToken][lpDataOutMiddle.oppositeToken];
      if (lpDataBC.lp != address(0)) {
        lpDataBC.token = lpDataIn.oppositeToken;
        lpDataBC.oppositeToken = lpDataOutMiddle.oppositeToken;
        route[1] = lpDataBC;
        (lpDataOutMiddle.oppositeToken, lpDataOutMiddle.token) = (lpDataOutMiddle.token, lpDataOutMiddle.oppositeToken);
        route[2] = lpDataOutMiddle;
        (lpDataOut.oppositeToken, lpDataOut.token) = (lpDataOut.token, lpDataOut.oppositeToken);
        route[3] = lpDataOut;
        return (route, 4);
      }
    }

    // we are not handling other cases
    revert("F2: Liquidation path not found");
  }


  /// @dev Adopted version of swap function from UniswapRouter
  ///      Assume that tokens exist on this contract
  function _swap(address tokenIn, address tokenOut, IUniswapV2Pair lp, uint amount) internal {
    require(amount != 0, "F2: Zero swap amount");
    (uint reserveIn, uint reserveOut) = getReserves(lp, tokenIn, tokenOut);

    UniFee memory fee = uniPlatformFee[lp.factory()];
    if (fee.numerator == 0) {
      fee = UniFee(DEFAULT_UNI_FEE_NUMERATOR, DEFAULT_UNI_FEE_DENOMINATOR);
    }
    uint amountOut = getAmountOut(amount, reserveIn, reserveOut, fee);
    IERC20(tokenIn).safeTransfer(address(lp), amount);
    if (amountOut != 0) {
      _swapCall(lp, tokenIn, tokenOut, amountOut);
    }
  }

  function _addLiquidity(
    address _router,
    address _token0,
    address _token1,
    uint256 _token0Amount,
    uint256 _token1Amount
  ) internal returns (uint256){
    IERC20(_token0).safeApprove(_router, 0);
    IERC20(_token0).safeApprove(_router, _token0Amount);
    IERC20(_token1).safeApprove(_router, 0);
    IERC20(_token1).safeApprove(_router, _token1Amount);

    (,, uint256 liquidity) = IUniswapV2Router02(_router).addLiquidity(
      _token0,
      _token1,
      _token0Amount,
      _token1Amount,
      _token0Amount * _slippageNumerator() / SLIPPAGE_DENOMINATOR,
      _token1Amount * _slippageNumerator() / SLIPPAGE_DENOMINATOR,
      address(this),
      block.timestamp
    );
    emit LiquidityAdded(_router, _token0, _token0Amount, _token1, _token1Amount);
    return liquidity;
  }

  /// @dev Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
  function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, UniFee memory fee) internal pure returns (uint amountOut) {
    uint amountInWithFee = amountIn * fee.numerator;
    uint numerator = amountInWithFee * reserveOut;
    uint denominator = (reserveIn * fee.denominator) + amountInWithFee;
    amountOut = numerator / denominator;
  }

  /// @dev Call swap function on pair with necessary preparations
  ///      Assume that amountOut already sent to the pair
  function _swapCall(IUniswapV2Pair _lp, address tokenIn, address tokenOut, uint amountOut) internal {
    (address token0,) = sortTokens(tokenIn, tokenOut);
    (uint amount0Out, uint amount1Out) = tokenIn == token0 ? (uint(0), amountOut) : (amountOut, uint(0));
    _lp.swap(amount0Out, amount1Out, address(this), new bytes(0));
  }

  /// @dev returns sorted token addresses, used to handle return values from pairs sorted in this order
  function sortTokens(address tokenA, address tokenB) internal pure returns (address token0, address token1) {
    (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
  }

  /// @dev fetches and sorts the reserves for a pair
  function getReserves(IUniswapV2Pair _lp, address tokenA, address tokenB) internal view returns (uint reserveA, uint reserveB) {
    (address token0,) = sortTokens(tokenA, tokenB);
    (uint reserve0, uint reserve1,) = _lp.getReserves();
    (reserveA, reserveB) = tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
  }
}
