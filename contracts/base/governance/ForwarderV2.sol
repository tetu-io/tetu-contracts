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

import "hardhat/console.sol";
import "../../swap/libraries/TetuSwapLibrary.sol";

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
  string public constant VERSION = "1.0.0";
  uint256 public constant LIQUIDITY_DENOMINATOR = 100;
  uint constant public DEFAULT_UNI_FEE_DENOMINATOR = 1000;
  uint constant public DEFAULT_UNI_FEE_NOMINATOR = 997;
  uint constant public SEARCH_MAX_DEEP = 4;
  uint constant public SLIPPAGE_DENOMINATOR = 100;
  uint constant public SLIPPAGE_NOMINATOR = 95;

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

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Only Governance or Controller can call it.
  ///         Add a pair with biggest TVL for given token
  function addLps(address[] memory _tokens, address[] memory _lps) external onlyControllerOrGovernance {
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
      lps[_tokens[i]] = LpData(address(lp), _tokens[i], oppositeToken);
    }
  }

  /// @notice Only Governance or Controller can call it.
  ///         Sets numerator for a part of profit that goes instead of PS to TETU liquidity
  function setLiquidityNumerator(uint256 _value) external onlyControllerOrGovernance {
    require(_value <= LIQUIDITY_DENOMINATOR, "F2: Too high value");
    _setLiquidityNumerator(_value);
  }

  /// @notice Only Governance or Controller can call it.
  ///         Sets router for a pair with TETU liquidity
  function setLiquidityRouter(address _value) external onlyControllerOrGovernance {
    _setLiquidityRouter(_value);
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

    // calculate require amounts in income token value
    uint toFund = _toFundAmount(_amount);
    uint toPsAndLiq = _toPsAndLiqAmount(_amount - toFund);
    uint toLiq = toPsAndLiq / 2;
    uint toLiqFundTokenPart = toLiq / 2;
    uint toLiqTetuTokenPart = toLiq / 2;
    uint toPs = toPsAndLiq - toLiq;
    uint toVault = _amount - toFund - toPsAndLiq;

    uint fundTokenRequires = toFund + toLiqFundTokenPart;
    uint tetuTokenRequires = toLiqTetuTokenPart + toPs + toVault;
    require(fundTokenRequires + tetuTokenRequires == _amount, "F2: Wrong amount sum");


    uint fundTokenAmount = _liquidate(_token, fundTokenRequires, fundToken());
    uint sentToFund = _sendToFund(fundTokenAmount, toFund, toLiqFundTokenPart);

    uint tetuTokenAmount = _liquidate(_token, tetuTokenRequires, tetu());

    uint256 tetuDistributed = 0;
    if (toPsAndLiq > 0) {
      tetuDistributed += _sendToPsAndLiquidity(
        tetuTokenAmount,
        toLiqTetuTokenPart,
        toPs,
        toVault,
        fundTokenAmount - sentToFund
      );
    }
    if (toVault > 0) {
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
    require(amount != 0, "F2: Zero amount for liquidation");
    IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);
    uint256 resultAmount = _liquidate(tokenIn, amount, tokenOut);
    require(resultAmount > 0, "F2: Liquidated with zero result");
    IERC20(tokenOut).safeTransfer(msg.sender, resultAmount);
    emit Liquidated(tokenIn, tokenOut, amount);
    return resultAmount;
  }

  /// @dev We don't need this function anymore, keep for compatibility
  function notifyPsPool(address, uint256) external pure override returns (uint256) {
    revert("Directly notifyPsPool not implemented");
  }

  /// @dev We don't need this function anymore, keep for compatibility
  function notifyCustomPool(address, address, uint256) external pure override returns (uint256) {
    revert("Directly notifyCustomPool not implemented");
  }


  //************************* INTERNAL **************************

  function _sendExcessTokens() internal {
    uint excessFundToken = IERC20(fundToken()).balanceOf(address(this));
    if (excessFundToken != 0 && fund() != address(0)) {
      IERC20(fundToken()).safeTransfer(fund(), excessFundToken);
      IBookkeeper(IController(controller()).bookkeeper())
      .registerFundKeeperEarned(fundToken(), excessFundToken);
      emit FeeMovedToFund(fund(), fundToken(), excessFundToken);
    }

    uint excessTetuToken = IERC20(tetu()).balanceOf(address(this));
    if (excessTetuToken != 0) {
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
    console.log("sendtoPs", toPs);
    console.log("sendtoPs bal", IERC20(tetu()).balanceOf(address(this)));
    IERC20(tetu()).safeTransfer(psVault(), toPs);
    emit FeeMovedToPs(psVault(), tetu(), toPs);
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

    uint baseSum = baseToLiqTetuTokenPart + baseToPs + baseToVault;
    uint toVault = tetuTokenAmount * baseToVault / baseSum;

    console.log("_sendToVault", toVault);
    console.log("_sendToVault bal", IERC20(tetu()).balanceOf(address(this)));
    IERC20(tetu()).safeApprove(psVault(), toVault);
    ISmartVault(psVault()).deposit(toVault);
    uint256 amountToSend = IERC20(xTetu).balanceOf(address(this));
    IERC20(xTetu).safeApprove(_vault, amountToSend);
    smartVault.notifyTargetRewardAmount(xTetu, amountToSend);
    emit FeeMovedToVault(_vault, xTetu, amountToSend);
    return toVault;
  }

  function _sendToFund(uint256 fundTokenAmount, uint baseToFundAmount, uint baseToLiqFundTokenPart) internal returns (uint){
    uint toFund = fundTokenAmount * baseToFundAmount / (baseToFundAmount + baseToLiqFundTokenPart);

    console.log("toFund", fundTokenAmount, toFund);
    // no actions if we don't have a fee for fund
    if (toFund == 0) {
      return 0;
    }
    require(fund() != address(0), "F2: Fund is zero");

    console.log("_sendToFund bal", IERC20(fundToken()).balanceOf(address(this)));
    IERC20(fundToken()).safeTransfer(fund(), toFund);

    IBookkeeper(IController(controller()).bookkeeper())
    .registerFundKeeperEarned(fundToken(), toFund);
    emit FeeMovedToFund(fund(), fundToken(), toFund);
    return toFund;
  }

  function _sendToLiquidity(uint toLiqTetuTokenPart, uint toLiqFundTokenPart) internal returns (uint256) {
    // no actions if we don't have a fee for liquidity
    if (toLiqTetuTokenPart == 0 || toLiqFundTokenPart == 0) {
      return 0;
    }

    console.log("_sendToLiquidity", toLiqFundTokenPart, toLiqTetuTokenPart);
    console.log("_sendToLiquidity balns", IERC20(fundToken()).balanceOf(address(this)), IERC20(tetu()).balanceOf(address(this)));

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
  function _liquidate(address _tokenIn, uint256 _amount, address _tokenOut) internal returns (uint256) {
    if (_tokenIn == _tokenOut) {
      // this is already the right token
      return _amount;
    }
    address tokenIn = _tokenIn;
    console.log("start liquidation", tokenIn);
    (LpData[] memory route, uint count) = _createLiquidationRoute(_tokenIn, _tokenOut);

    for (uint i = count; i > 0; i--) {
      LpData memory lpData = route[i - 1];
      console.log("lpData for swap", lpData.lp, lpData.token, lpData.oppositeToken);
      if (lpData.lp == address(0)) {
        continue;
      }
      _swap(lpData.oppositeToken, lpData.token, IUniswapV2Pair(lpData.lp), _amount);
    }
    return IERC20(_tokenOut).balanceOf(address(this));
  }

  function _createLiquidationRoute(address _tokenIn, address _targetOut) internal view returns (LpData[] memory, uint)  {
    LpData[] memory route = new LpData[](SEARCH_MAX_DEEP);
    address token = _targetOut;
    uint count = 0;
    while (true) {
      LpData memory lpData = lps[token];
      console.log("pure lpData", lpData.lp, lpData.oppositeToken);
      require(lpData.lp != address(0), "F2: LP for swap not found");
      route[count] = lpData;
      count++;
      if (lpData.oppositeToken == _tokenIn) {
        break;
      }
      token = lpData.oppositeToken;
      require(count <= SEARCH_MAX_DEEP, "F2: LP for swap not found, too deep");
    }
    return (route, count);
  }


  /// @dev Adopted version of swap function from UniswapRouter
  ///      Assume that tokens exist on this contract
  function _swap(address tokenIn, address tokenOut, IUniswapV2Pair lp, uint amount) internal {
    require(amount != 0, "F2: Zero swap amount");
    (uint reserveIn, uint reserveOut) = getReserves(lp, tokenIn, tokenOut);

    console.log("reserveIn", tokenIn, reserveIn);
    console.log("reserveOut", tokenOut, reserveOut);

    UniFee memory fee = uniPlatformFee[lp.factory()];
    if (fee.nominator == 0) {
      fee = UniFee(DEFAULT_UNI_FEE_NOMINATOR, DEFAULT_UNI_FEE_DENOMINATOR);
    }
    uint amountOut = getAmountOut(amount, reserveIn, reserveOut, fee);

    IERC20(tokenIn).safeTransfer(address(lp), amount);
    console.log("amountOut to swap", amountOut);
    console.log("amount to swap", amount, tokenIn);
    console.log("balance tokenOut", IERC20(tokenOut).balanceOf(address(this)), tokenOut);
    _swapCall(lp, tokenIn, tokenOut, amountOut);
    console.log("balance tokenOut after", IERC20(tokenOut).balanceOf(address(this)));
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
      _token0Amount * SLIPPAGE_NOMINATOR / SLIPPAGE_DENOMINATOR,
      _token1Amount * SLIPPAGE_NOMINATOR / SLIPPAGE_DENOMINATOR,
      address(this),
      block.timestamp
    );
    emit LiquidityAdded(_router, _token0, _token0Amount, _token1, _token1Amount);
    return liquidity;
  }

  /// @dev Given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
  function getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, UniFee memory fee) internal pure returns (uint amountOut) {
    uint amountInWithFee = amountIn * fee.nominator;
    uint numerator = amountInWithFee * reserveOut;
    uint denominator = (reserveIn * fee.denominator) + amountInWithFee;
    amountOut = numerator / denominator;
  }

  /// @dev Call swap function on pair with necessary preparations
  ///      Assume that amountOut already sent to the pair
  function _swapCall(IUniswapV2Pair _lp, address tokenIn, address tokenOut, uint amountOut) internal {
    (address token0,) = sortTokens(tokenIn, tokenOut);
    console.log("check token0", token0, _lp.token0(), token0 == _lp.token0());
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
