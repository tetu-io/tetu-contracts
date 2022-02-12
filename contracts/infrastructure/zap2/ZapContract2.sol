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

import "../../openzeppelin/SafeMath.sol";
import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../../openzeppelin/ReentrancyGuard.sol";
import "../../base/governance/ControllableV2.sol";
import "../../base/interface/ISmartVault.sol";
import "../../base/interface/IStrategy.sol";
import "../../base/interface/IController.sol";
import "../../third_party/uniswap/IUniswapV2Pair.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";
import "../price/IPriceCalculator.sol";
import "./IMultiSwap2.sol";
import "./IZapContract2.sol";

/// @title Dedicated solution for interacting with Tetu vaults.
///        Able to zap in/out assets to vaults
/// @author belbix
contract ZapContract2 is IZapContract2, ControllableV2, ReentrancyGuard {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  string public constant VERSION = "2.0.0";

  IMultiSwap2 public multiSwap;
  mapping(address => uint256) calls;
  mapping(address => address) public factoryToRouter;

/*  struct ZapInfo {
    address lp;
    address tokenIn;
    address asset0;
    address[] asset0Route;
    address asset1;
    address[] asset1Route;
    uint tokenInAmount;
    uint slippageTolerance;
  }*/

  constructor(address _controller, address _multiSwap, address[] memory _factories,
    address[] memory _routers) {
    initialize(_controller, _multiSwap, _factories, _routers);
  }

  function initialize(address _controller, address _multiSwap, address[] memory _factories,
    address[] memory _routers) public initializer {
    require(_multiSwap != address(0), "ZC: zero multiSwap address");
    ControllableV2.initializeControllable(_controller);
    multiSwap = IMultiSwap2(_multiSwap);
    for (uint i = 0; i < _factories.length; i++) {
      factoryToRouter[_factories[i]] = _routers[i];
    }
  }

  modifier onlyOneCallPerBlockDirect() {
    require(msg.sender == tx.origin, "ZC: Indirect calls restricted");
    require(calls[msg.sender] < block.number, "ZC: call in the same block forbidden");
    _;
    calls[msg.sender] = block.number;
  }

  // ******************* VIEWS *****************************

  function routerForPair(address pair) public override view returns (address) { // TODO split to internal and external
    return factoryToRouter[IUniswapV2Pair(pair).factory()];
  }

  // ******************** USERS ACTIONS *********************

  /// @notice Approval for token is assumed.
  ///      Buy token and deposit to given vault
  ///      TokenIn should be declared as a keyToken in the PriceCalculator
  /// @param _vault A target vault for deposit
  /// @param _tokenIn This token will be swapped to required token for adding liquidity
  /// @param _asset Token address required for adding liquidity
  /// @param _routesData Routes data with weights
  /// @param _tokenInAmount Amount of token for deposit
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapInto(
    address _vault,
    address _tokenIn,
    address _asset,
    bytes memory _routesData,
    uint _tokenInAmount,
    uint slippageTolerance
  ) external override nonReentrant onlyOneCallPerBlockDirect {
    require(_tokenInAmount > 1, "ZC: not enough amount");
    require(_asset == ISmartVault(_vault).underlying(), "ZC: asset is not underlying");

    IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _tokenInAmount);

    // asset multi-swap
    _callMultiSwap(
      _tokenIn,
      _tokenInAmount,
      _routesData,
      _asset,
      slippageTolerance
    );
    // assume that final outcome amount was checked on the multiSwap contract side

    uint assetAmount = IERC20(_asset).balanceOf(address(this));

    _depositToVault(_vault, assetAmount, _asset);
  }

  /// @notice Approval for token is assumed.
  ///      Add liquidity and deposit to given vault with Uin pair underlying
  ///      TokenIn should be declared as a keyToken in the PriceCalculator
  /// @param _vault A target vault for deposit
  /// @param _tokenIn This token will be swapped to required token for adding liquidity
  /// @param _asset0 Token address required for adding liquidity
  /// @param _routesData0 Pair weighted routes for buying asset0
  /// @param _asset1 Token address required for adding liquidity
  /// @param _routesData1 Pair weighted routes for buying asset1
  /// @param _tokenInAmount Amount of token for deposit
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapIntoLp(
    address _vault,
    address _tokenIn,
    address _asset0,
    bytes memory _routesData0,
    address _asset1,
    bytes memory _routesData1,
    uint _tokenInAmount,
    uint slippageTolerance
  ) external override nonReentrant onlyOneCallPerBlockDirect {
    require(_tokenInAmount > 1, "ZC: not enough amount");

    IUniswapV2Pair lp = IUniswapV2Pair(ISmartVault(_vault).underlying());
    require(_asset0 == lp.token0() || _asset0 == lp.token1(), "ZC: asset 0 not exist in lp tokens");
    require(_asset1 == lp.token0() || _asset1 == lp.token1(), "ZC: asset 1 not exist in lp tokens");

    // transfer only require amount
    IERC20(_tokenIn).safeTransferFrom(msg.sender, address(this), _tokenInAmount.div(2).mul(2));

    // asset0 multi-swap
    _callMultiSwap(
      _tokenIn,
      _tokenInAmount.div(2),
      _routesData0,
      _asset0,
      slippageTolerance
    );

    // asset1 multi-swap
    _callMultiSwap(
      _tokenIn,
      _tokenInAmount.div(2),
      _routesData1,
      _asset1,
      slippageTolerance
    );
    // assume that final outcome amounts was checked on the multiSwap contract side

    uint liquidity = _addLiquidity(
      ZapInfo(
        address(lp),
        _tokenIn,
        _asset0,
        _routesData0,
        _asset1,
        _routesData1,
        _tokenInAmount,
        slippageTolerance
      )
    );

    require(liquidity != 0, "ZC: zero liq");
    _depositToVault(_vault, liquidity, address(lp));
  }

  /// @notice Approval for share token is assumed.
  ///         Withdraw from given vault underlying and sell tokens for given tokenOut
  /// @param _vault A target vault for withdraw
  /// @param _tokenOut This token will be a target for swaps
  /// @param _asset Token address required selling removed assets
  /// @param _routesData Pair weighted routes for selling asset0
  /// @param _shareTokenAmount Amount of share token for withdraw
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapOut(
    address _vault,
    address _tokenOut,
    address _asset,
    bytes memory _routesData,
    uint _shareTokenAmount,
    uint slippageTolerance
  ) external override nonReentrant onlyOneCallPerBlockDirect {
    require(_shareTokenAmount != 0, "ZC: zero amount");
    require(_asset == ISmartVault(_vault).underlying(), "ZC: asset is not underlying");

    IERC20(_vault).safeTransferFrom(msg.sender, address(this), _shareTokenAmount);

    uint assetBalance = _withdrawFromVault(_vault, _asset, _shareTokenAmount);

    // asset multi-swap
    _callMultiSwap(
      _asset,
      assetBalance,
      _routesData,
      _tokenOut,
      slippageTolerance
    );

    uint tokenOutBalance = IERC20(_tokenOut).balanceOf(address(this));
    require(tokenOutBalance != 0, "zero token out balance");
    IERC20(_tokenOut).safeTransfer(msg.sender, tokenOutBalance);
  }

  /// @notice Approval for share token is assumed.
  ///      Withdraw from given vault underlying, remove liquidity and sell tokens for given tokenOut
  /// @param _vault A target vault for withdraw
  /// @param _tokenOut This token will be a target for swaps
  /// @param _asset0 Token address required selling removed assets
  /// @param _routesData0 Pair weighted routes for selling asset0
  /// @param _asset1 Token address required selling removed assets
  /// @param _routesData1 Pair weighted routes for selling asset1
  /// @param _shareTokenAmount Amount of share token for withdraw
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapOutLp(
    address _vault,
    address _tokenOut,
    address _asset0,
    bytes memory _routesData0,
    address _asset1,
    bytes memory _routesData1,
    uint _shareTokenAmount,
    uint slippageTolerance
  ) external override nonReentrant onlyOneCallPerBlockDirect {
    require(_shareTokenAmount != 0, "ZC: zero amount");

    IUniswapV2Pair lp = IUniswapV2Pair(ISmartVault(_vault).underlying());
    require(_asset0 == lp.token0() || _asset0 == lp.token1(), "ZC: asset 0 not exist in lp token");
    require(_asset1 == lp.token0() || _asset1 == lp.token1(), "ZC: asset 1 not exist in lp token");

    IERC20(_vault).safeTransferFrom(msg.sender, address(this), _shareTokenAmount);

    uint lpBalance = _withdrawFromVault(_vault, address(lp), _shareTokenAmount);

    IUniswapV2Router02 router = IUniswapV2Router02(routerForPair(address(lp)));

    IERC20(address(lp)).safeApprove(address(router), 0);
    IERC20(address(lp)).safeApprove(address(router), lpBalance);
    // without care about slippage
    router.removeLiquidity(
      _asset0,
      _asset1,
      lpBalance,
      1,
      1,
      address(this),
      block.timestamp
    );

    // asset0 multi-swap
    _callMultiSwap(
      _asset0,
      IERC20(_asset0).balanceOf(address(this)),
      _routesData0,
      _tokenOut,
      slippageTolerance
    );

    // asset1 multi-swap
    _callMultiSwap(
      _asset1,
      IERC20(_asset1).balanceOf(address(this)),
      _routesData1,
      _tokenOut,
      slippageTolerance
    );

    uint tokenOutBalance = IERC20(_tokenOut).balanceOf(address(this));
    require(tokenOutBalance != 0, "zero token out balance");
    IERC20(_tokenOut).safeTransfer(msg.sender, tokenOutBalance);
  }

  // ************************* INTERNAL *******************

  function _addLiquidity(ZapInfo memory zapInfo) internal returns (uint256){
    uint asset0Amount = IERC20(zapInfo.asset0).balanceOf(address(this));
    uint asset1Amount = IERC20(zapInfo.asset1).balanceOf(address(this));

    IUniswapV2Router02 router = IUniswapV2Router02(routerForPair(zapInfo.lp));

    IERC20(zapInfo.asset0).safeApprove(address(router), 0);
    IERC20(zapInfo.asset0).safeApprove(address(router), asset0Amount);
    IERC20(zapInfo.asset1).safeApprove(address(router), 0);
    IERC20(zapInfo.asset1).safeApprove(address(router), asset1Amount);
    // without care about min amounts
    (,, uint liquidity) = router.addLiquidity(
      zapInfo.asset0,
      zapInfo.asset1,
      asset0Amount,
      asset1Amount,
      1,
      1,
      address(this),
      block.timestamp
    );
    // send back change if exist
//    sendBackChange(zapInfo); // TODO remove
    return liquidity;
  }

  function _callMultiSwap(
    address _tokenIn,
    uint _tokenInAmount,
    bytes memory _routesData,
    address _tokenOut,
    uint _slippageTolerance
  ) internal {
    if (_tokenIn == _tokenOut) {
      // no actions if we already have required token
      return;
    }
    require(_tokenInAmount <= IERC20(_tokenIn).balanceOf(address(this)), "ZC: not enough balance for multi-swap");
    IERC20(_tokenIn).safeApprove(address(multiSwap), 0);
    IERC20(_tokenIn).safeApprove(address(multiSwap), _tokenInAmount);
    multiSwap.multiSwap(_tokenIn, _tokenOut, _tokenInAmount, _slippageTolerance, _routesData);
  }

  /// @dev Deposit into the vault, check the result and send share token to msg.sender
  function _depositToVault(address _vault, uint _amount, address _underlying)
  internal {
    require(ISmartVault(_vault).underlying() == _underlying, "ZC: wrong lp for vault");

    IERC20(_underlying).safeApprove(_vault, 0);
    IERC20(_underlying).safeApprove(_vault, _amount);
    ISmartVault(_vault).depositAndInvest(_amount);

    uint shareBalance = IERC20(_vault).balanceOf(address(this));
    require(shareBalance != 0, "ZC: zero shareBalance");

    IERC20(_vault).safeTransfer(msg.sender, shareBalance);
  }

  /// @dev Withdraw from vault and check the result
  function _withdrawFromVault(address _vault, address _underlying, uint _amount)
  internal returns (uint256){
    ISmartVault(_vault).withdraw(_amount);

    uint underlyingBalance = IERC20(_underlying).balanceOf(address(this));
    require(underlyingBalance != 0, "ZC: zero underlying balance");
    return underlyingBalance;
  }

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint _amount) override external {
    require(_isGovernance(msg.sender) || _isController(msg.sender), "ZC: forbidden");
    IERC20(_token).safeTransfer(msg.sender, _amount);
  }

}
