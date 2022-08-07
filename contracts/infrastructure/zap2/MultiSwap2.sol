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
import "../../openzeppelin/IERC20Metadata.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/ReentrancyGuard.sol";
import "../../base/governance/ControllableV2.sol";
import "../../swap/interfaces/ITetuSwapPair.sol";
import "../../third_party/dystopia/IPair.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";
import "../../third_party/balancer/IBVault.sol";
import "../../third_party/IERC20Name.sol"; // TODO remove
import "../../base/SlotsLib.sol";
import "./IMultiSwap2.sol";

import "hardhat/console.sol"; // TODO remove

/// @title Tetu MultiSwap v2 Contract
/// @dev Supports 1 Balancer, 1 Dystopia, up to 15 UniSwap v2 compatible pools
/// @author bogdoslav
contract MultiSwap2 is IMultiSwap2, ControllableV2, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using SlotsLib for bytes32;

  string public constant VERSION = "1.1.1";
  uint256 private constant _SLIPPAGE_PRECISION = 10000;
  uint256 private constant _PRECISION_FEE = 10000;
  bytes32 private constant _DEX_ID_MASK = 0x0000000000000000000000000000000000000000fffffffffffffffffffffff0; // last half-byte - index of dex 0-15
  bytes32 private constant _UNISWAP_DEX_ID = 0x0000000000000000000000000000000000000000fffffffffffffffffffffff0;
  bytes32 private constant _DYSTOPIA_DEX_ID = 0x0000000000000000000000000000000000000000ddddddddddddddddddddddd0;
  address public immutable WETH;
  address public immutable balancerVault;
  address public immutable tetuFactory;

  // Sentinel value used to indicate WETH with wrapping/unwrapping semantics. The zero address is a good choice for
  // multiple reasons: it is cheap to pass as a calldata argument, it is a known invalid token and non-contract, and
  // it is an address Pools cannot register as a token.
  address private constant _ETH = address(0);

  event MultiSwap(address tokenIn, uint amountIn, address tokenOut, uint amountOut);
  event Salvage(address sender, address token, uint amount);

  error MSZeroWETH();
  error MSZeroBalancerVault();
  error MSZeroTetuFactory();
  error MSSameTokens();
  error MSSameTokensInSwap();
  error MSZeroAmount();
  error MSWrongTokens();
  error MSUnknownAmountInFirstSwap();
  error MSDeadline();
  error MSTransferFeesForbiddenForInputToken();
  error MSTransferFeesForbiddenForOutputToken();
  error MSMalconstructedMultiSwap();
  error MSAmountOutLessThanRequired();
  error MSForbidden();


  constructor (address controller_, address weth_, address balancerVault_, address tetuFactory_) {
    ControllableV2.initializeControllable(controller_);
    if (weth_ == address(0)) revert MSZeroWETH();
    if (balancerVault_ == address(0)) revert MSZeroBalancerVault();
    if (tetuFactory_ == address(0)) revert MSZeroTetuFactory();

    WETH = weth_;
    balancerVault = balancerVault_;
    tetuFactory = tetuFactory_;
  }

  // ******************** USERS ACTIONS *********************
  function multiSwap(
    SwapData memory swapData,
    SwapStep[] memory swaps,
    IAsset[] memory tokenAddresses,
    uint slippage,
    uint deadline
  )
    external
    payable
    override
    nonReentrant
    returns (uint amountOut)
  {
    if (swapData.tokenIn == swapData.tokenOut) revert MSSameTokens();
    if (swapData.swapAmount == 0) revert MSZeroAmount();
    if (swaps[0].amount == 0) revert MSUnknownAmountInFirstSwap();

    // The deadline is timestamp-based: it should not be relied upon for sub-minute accuracy.
    // solhint-disable-next-line not-rely-on-time
    if (block.timestamp > deadline) revert MSDeadline();

    IERC20(swapData.tokenIn).safeTransferFrom(msg.sender, address(this), swapData.swapAmount);
    // some tokens have a burn/fee mechanic for transfers so amount can be changed
    // we are recommend to use manual swapping for this kind of tokens
    // TODO add SPHERE to white list
//    if (IERC20(swapData.tokenIn).balanceOf(address(this)) < swapData.swapAmount)
//      revert MSTransferFeesForbiddenForInputToken();

    // These store data about the previous swap here to implement multihop logic across swaps.
    IERC20 previousTokenOut = IERC20(swapData.tokenIn);
    uint256 previousAmountOut = swapData.swapAmount;

    // These variables could be declared inside the loop, but that causes the compiler to allocate memory on each
    // loop iteration, increasing gas costs.
    SwapStep memory swapStep;
    uint len = swaps.length;
    for (uint i = 0; i < len; i++) {
      swapStep = swaps[i];

      IERC20 swapTokenIn = _translateToIERC20(tokenAddresses[swapStep.assetInIndex]);
      IERC20 swapTokenOut = _translateToIERC20(tokenAddresses[swapStep.assetOutIndex]);

      uint swapAmount;
      if (swapStep.amount == 0) {
        if ((previousTokenOut != swapTokenIn) || (previousAmountOut == 0)) revert MSMalconstructedMultiSwap();
        swapAmount = previousAmountOut;
      } else {
        swapAmount = swapStep.amount;
      }

      if (swapTokenIn == swapTokenOut) revert MSSameTokensInSwap();

      console.logBytes32(swapStep.poolId);// TODO remove

      // SWAPPING
      if (_isUniswapPool(swapStep.poolId)) {
        previousAmountOut = _swapUniswap(swapStep, swapTokenIn, swapTokenOut, swapAmount);
      } else if (_isDystopiaPool(swapStep.poolId)) {
        previousAmountOut = _swapDystopia(swapStep, swapTokenIn, swapTokenOut, swapAmount);
      } else { // Suppose Balancer pool
        previousAmountOut = _swapBalancer(swapStep, swapTokenIn, swapTokenOut, swapAmount);
      }
      uint balanceOut =  swapTokenOut.balanceOf(address(this));
      console.log('previousAmountOut', previousAmountOut, balanceOut);
      console.log('balanceOut       ', balanceOut);
      previousAmountOut = _min( swapTokenOut.balanceOf(address(this)), previousAmountOut);
      previousTokenOut = swapTokenOut;
    }

    amountOut = IERC20(swapData.tokenOut).balanceOf(address(this));
    console.log('swapData.tokenOut', swapData.tokenOut);
    console.log('amountOut', amountOut);
    uint minAmountOut = swapData.returnAmount - swapData.returnAmount * slippage / _SLIPPAGE_PRECISION;

    { // avoid stack to deep
//      uint balanceBefore = IERC20(swapData.tokenOut).balanceOf(msg.sender);
      IERC20(swapData.tokenOut).safeTransfer(msg.sender, amountOut);
//      uint balanceAfter = IERC20(swapData.tokenOut).balanceOf(msg.sender);
      // TODO add SPHERE to white list
//      if (amountOut > (balanceAfter - balanceBefore))
//        revert MSTransferFeesForbiddenForOutputToken();
    }

    if (amountOut < minAmountOut) revert MSAmountOutLessThanRequired();

    emit MultiSwap(swapData.tokenIn, swapData.swapAmount, swapData.tokenOut, amountOut);
  }


  // ******************* INTERNAL ***************************

  function _min(uint256 a, uint256 b) internal pure returns (uint256) {
    return a <= b ? a : b;
  }

  /**
   * @dev Returns the address of a Pool's contract.
   *
   * Due to how Pool IDs are created, this is done with no storage accesses and costs little gas.
   */
  function _getPoolAddress(bytes32 poolId) internal pure returns (address) {
    // 12 byte logical shift left to remove the nonce and specialization setting. We don't need to mask,
    // since the logical shift already sets the upper bits to zero.
    return address(uint160(uint256(poolId) >> (12 * 8)));
  }

  function _isUniswapPool(bytes32 poolId) internal pure returns (bool) {
    return (poolId & _DEX_ID_MASK) == _UNISWAP_DEX_ID;
  }

  function _isDystopiaPool(bytes32 poolId) internal pure returns (bool) {
    return (poolId & _DEX_ID_MASK) == _DYSTOPIA_DEX_ID;
  }

  function _swapBalancer(
    SwapStep memory swapStep,
    IERC20 tokenIn,
    IERC20 tokenOut,
    uint swapAmount
  )
  internal returns (uint amountOut) {
    // Initializing each struct field one-by-one uses less gas than setting all at once.
    IBVault.FundManagement memory funds;
    funds.sender = address(this);
    funds.fromInternalBalance = false;
    funds.recipient = payable(address(this));
    funds.toInternalBalance = false;

    // Initializing each struct field one-by-one uses less gas than setting all at once.
    IBVault.SingleSwap memory singleSwap;
    singleSwap.poolId = swapStep.poolId;

    singleSwap.kind = IBVault.SwapKind.GIVEN_IN;
    singleSwap.assetIn = IAsset(address(tokenIn));
    singleSwap.assetOut = IAsset(address(tokenOut));
    singleSwap.amount = swapAmount;
    singleSwap.userData = swapStep.userData;

    // we'll check total amount out after all swaps, so do not care about intermediate swap step
    uint limit = 1;
    tokenIn.approve(balancerVault, swapAmount);
    amountOut = IBVault(balancerVault).swap(singleSwap, funds, limit, block.timestamp);
  }

  function _swapUniswap(
    SwapStep memory swapStep,
    IERC20 tokenIn,
    IERC20 tokenOut,
    uint swapAmount
  )
  internal returns (uint amountOut) {
    IUniswapV2Pair pair = IUniswapV2Pair(_getPoolAddress(swapStep.poolId));

    if (pair.factory() == tetuFactory) {
      pair.sync();
    }

    address token1 = pair.token1();
    {
    address token0 = pair.token0();

    if (!((token0 == address(tokenIn) && token1 == address(tokenOut)) ||
          (token1 == address(tokenIn) && token0 == address(tokenOut))))
    {
      revert MSWrongTokens();
    }
    }

    console.log('swapAmount', swapAmount, tokenIn.balanceOf(address(this)));
    tokenIn.safeTransfer(address(pair), swapAmount);
    bool reverse = address(tokenIn) == token1;
    console.log('reverse', reverse);
    (uint amountOut0, uint amountOut1) = _getAmountsOut(pair, swapAmount, reverse, swapStep.platformFee);
    console.log('amountOut0, amountOut1', amountOut0, amountOut1);
    pair.swap(amountOut0, amountOut1, address(this), swapStep.userData);
    amountOut = reverse ? amountOut0 : amountOut1;
  }

  function _swapDystopia(
    SwapStep memory swapStep,
    IERC20 tokenIn,
    IERC20 tokenOut,
    uint swapAmount
  )
  internal returns (uint amountOut) {
    IPair pair = IPair(_getPoolAddress(swapStep.poolId));

    address token0 = pair.token0();
    address token1 = pair.token1();

    if (!((token0 == address(tokenIn) && token1 == address(tokenOut)) ||
          (token1 == address(tokenIn) && token0 == address(tokenOut))))
      revert MSWrongTokens();

    tokenIn.safeTransfer(address(pair), swapAmount);

    amountOut = pair.getAmountOut(swapAmount, address(tokenIn));
    bool reverse = address(tokenIn) == token1;
    (uint amountOut0, uint amountOut1) = reverse ? (amountOut, uint(0)) : (uint(0), amountOut);
    pair.swap(amountOut0, amountOut1, address(this), swapStep.userData);
  }

  function _getAmountsOut(IUniswapV2Pair pair, uint amountIn, bool reverse, uint baseFee)
  internal view returns(uint amountOut0, uint amountOut1) {
    (amountOut0, amountOut1) = (0, 0);
    uint fee = _getTetuSwapFee(address(pair), baseFee);
    console.log('fee', fee);
    (uint112 reserve0, uint112 reserve1,) = pair.getReserves();

    if (reverse) {
      amountOut0 = _getAmountOut(amountIn, reserve1, reserve0, fee);
    } else {
      amountOut1 = _getAmountOut(amountIn, reserve0, reserve1, fee);
    }
  }

  /// @dev given an input amount of an asset and pair reserves, returns the maximum output amount of the other asset
  function _getAmountOut(uint amountIn, uint reserveIn, uint reserveOut, uint fee)
  internal pure returns (uint amountOut) {
    uint amountInWithFee = amountIn * (_PRECISION_FEE - fee);
    uint numerator = amountInWithFee * reserveOut;
    uint denominator = reserveIn * _PRECISION_FEE + amountInWithFee;
    amountOut = numerator / denominator;
  }

  /// @dev returns fee for tetuswap or default uniswap v2 fee for other swaps
  function _getTetuSwapFee(address pair, uint defaultFee)
  internal view returns (uint) {
    try ITetuSwapPair(pair).fee() returns (uint fee) {
      return fee;
    } catch Error(string memory /*reason*/) {
    } catch Panic(uint /*errorCode*/) {
    } catch (bytes memory /*lowLevelData*/) {
    }
    return defaultFee;
  }

  // ************************* INTERNAL ASSET HELPERS *******************

  /**
   * @dev Returns true if `asset` is the sentinel value that represents ETH.
   */
  function _isETH(IAsset asset) internal pure returns (bool) {
    return address(asset) == _ETH;
  }

  /**
   * @dev Translates `asset` into an equivalent IERC20 token address. If `asset` represents ETH, it will be translated
   * to the WETH contract.
   */
  function _translateToIERC20(IAsset asset) internal view returns (IERC20) {
    return _isETH(asset) ? IERC20(WETH) : _asIERC20(asset);
  }

  /**
   * @dev Interprets `asset` as an IERC20 token. This function should only be called on `asset` if `_isETH` previously
   * returned false for it, that is, if `asset` is guaranteed not to be the ETH sentinel value.
   */
  function _asIERC20(IAsset asset) internal pure returns (IERC20) {
    return IERC20(address(asset));
  }

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint _amount) external {
    if (!(_isGovernance(msg.sender) || _isController(msg.sender))) revert MSForbidden();
    IERC20(_token).safeTransfer(msg.sender, _amount);
    emit Salvage(msg.sender, _token, _amount);
  }

}
