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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../base/governance/Controllable.sol";
import "../base/interface/ISmartVault.sol";
import "../base/interface/IStrategy.sol";
import "../base/interface/IController.sol";
import "../third_party/uniswap/IUniswapV2Pair.sol";
import "../third_party/uniswap/IUniswapV2Router02.sol";
import "../third_party/iron/IIronLpToken.sol";
import "../third_party/iron/IIronSwap.sol";
import "./IMultiSwap.sol";

/// @title Dedicated solution for interacting with Tetu vaults.
///        Able to zap in/out Iron IS3USD assets to vaults
/// @author belbix, bogdoslav
contract ZapContractIron is Controllable, ReentrancyGuard {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  string public constant VERSION = "1.0.0";

  IMultiSwap public multiSwap;
  mapping(address => uint256) calls;

  struct ZapInfo {
    address lp;
    address tokenIn;
    address[] assets;
    address[][] assetsRoutes;
    uint256 tokenInAmount;
    uint256 slippageTolerance;
  }

  constructor(address _controller, address _multiSwap) {
    require(_multiSwap != address(0), "ZC: zero multiSwap address");
    Controllable.initializeControllable(_controller);
    multiSwap = IMultiSwap(_multiSwap);
  }

  modifier onlyOneCallPerBlock() {
    require(calls[msg.sender] < block.number, "ZC: call in the same block forbidden");
    _;
    calls[msg.sender] = block.number;
  }

  string constant _ZC_WRONG_ASSETS_COUNT = "ZC: wrong assets count";
  string constant _ZC_WRONG_ROUTES_COUNT = "ZC: wrong routes count";
  string constant _ZC_WRONG_ASSETS       = "ZC: wrong assets";

  // ******************** USERS ACTIONS *********************

  /// @notice Approval for token is assumed.
  ///      Add liquidity and deposit to given vault with Uin pair underlying
  ///      TokenIn should be declared as a keyToken in the PriceCalculator
  /// @param _vault A target vault for deposit
  /// @param _tokenIn This token will be swapped to required token for adding liquidity
  /// @param _assets Tokens addresses required for adding liquidity
  /// @param _assetsRoutes Pair addresses for buying asset
  /// @param _tokenInAmount Amount of token for deposit
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapIntoIron(
    address _vault,
    address _tokenIn,
    address[] memory _assets,
    address[][] memory _assetsRoutes,
    uint256 _tokenInAmount,
    uint256 slippageTolerance
  ) external nonReentrant onlyOneCallPerBlock {
    require(_tokenInAmount > 1, "ZC: not enough amount");

    IIronLpToken lp = IIronLpToken(ISmartVault(_vault).underlying());
    IIronSwap swap = IIronSwap(lp.swap());

    IERC20[] memory tokens = swap.getTokens();
    uint256 tokensLength = tokens.length;

    require(_assets.length == tokensLength, _ZC_WRONG_ASSETS_COUNT);
    require(_assets.length == _assetsRoutes.length, _ZC_WRONG_ROUTES_COUNT);
    for (uint256 i=0; i<tokensLength; i++) {
      require(_assets[i] == address(tokens[i]), _ZC_WRONG_ASSETS);
    }

    // transfer only require amount
    uint256 tokenInAmountDivided = _tokenInAmount.div(tokensLength);

    IERC20(_tokenIn).safeTransferFrom(
      msg.sender, address(this), tokenInAmountDivided.mul(tokensLength)
    );

    // assets multi-swap
    for (uint256 i=0; i<tokensLength; i++) {
      callMultiSwap(
        _tokenIn,
        tokenInAmountDivided,
        _assetsRoutes[i],
        _assets[i],
        slippageTolerance
      );
    }

    // assume that final outcome amounts was checked on the multiSwap contract side

    uint256 liquidity = addLiquidity(
      ZapInfo(
        address(swap),
        _tokenIn,
        _assets,
        _assetsRoutes,
        _tokenInAmount,
        slippageTolerance
      )
    );

    require(liquidity != 0, "ZC: zero liq");
    depositToVault(_vault, liquidity, address(lp));
  }

  /// @notice Approval for share token is assumed.
  ///      Withdraw from given vault underlying, remove liquidity and sell tokens for given tokenOut
  /// @param _vault A target vault for withdraw
  /// @param _tokenOut This token will be a target for swaps
  /// @param _assets Tokens addresses required selling removed assets
  /// @param _assetsRoutes Pair addresses array for selling assets
  /// @param _shareTokenAmount Amount of share token for withdraw
  /// @param slippageTolerance A number in 0-100 range that reflect is a percent of acceptable slippage
  function zapOutIron(
    address _vault,
    address _tokenOut,
    address[] memory _assets,
    address[][] memory _assetsRoutes,
    uint256 _shareTokenAmount,
    uint256 slippageTolerance
  ) external nonReentrant onlyOneCallPerBlock {
    require(_shareTokenAmount != 0, "ZC: zero amount");

    IIronLpToken lp = IIronLpToken(ISmartVault(_vault).underlying());
    IIronSwap swap = IIronSwap(lp.swap());

    IERC20[] memory tokens = swap.getTokens();
    uint256 tokensLength = tokens.length;

    require(_assets.length == tokensLength, _ZC_WRONG_ASSETS_COUNT);
    require(_assets.length == _assetsRoutes.length, _ZC_WRONG_ROUTES_COUNT);

    uint256[] memory minAmounts = new uint256[](tokensLength);
    for (uint256 i=0; i<tokensLength; i++) {
      require(_assets[i] == address(tokens[i]), _ZC_WRONG_ASSETS);
      minAmounts[i] = 1; // for removeLiquidity without care about slippage
    }

    IERC20(_vault).safeTransferFrom(msg.sender, address(this), _shareTokenAmount);

    uint256 lpBalance = withdrawFromVault(_vault, address(lp), _shareTokenAmount);

    IERC20(address(lp)).safeApprove(address(swap), 0);
    IERC20(address(lp)).safeApprove(address(swap), lpBalance);

    // without care about slippage
    swap.removeLiquidity(
      lpBalance,
      minAmounts,
      block.timestamp
    );

    // assets multi-swap
    for (uint256 i=0; i<tokensLength; i++) {
      callMultiSwap(
        _assets[i],
        IERC20(_assets[i]).balanceOf(address(this)),
        _assetsRoutes[i],
        _tokenOut,
        slippageTolerance
      );
    }

    uint256 tokenOutBalance = IERC20(_tokenOut).balanceOf(address(this));
    require(tokenOutBalance != 0, "zero token out balance");
    IERC20(_tokenOut).safeTransfer(msg.sender, tokenOutBalance);
  }

  // ************************* INTERNAL *******************

  function addLiquidity(ZapInfo memory zapInfo) internal returns (uint256){
    IIronSwap swap = IIronSwap(zapInfo.lp);

    uint256 assetsLength = zapInfo.assets.length;
    uint256[] memory amounts = new uint256[](assetsLength);

    for (uint256 i=0; i<assetsLength; i++) {
      address asset = zapInfo.assets[i];
      uint256 assetAmount = IERC20(asset).balanceOf(address(this));
      amounts[i] = assetAmount;
      IERC20(asset).safeApprove(address(swap), 0);
      IERC20(asset).safeApprove(address(swap), assetAmount);
    }

    // without care about min amounts
    uint256 liquidity = swap.addLiquidity(
      amounts,
      1,
      block.timestamp
    );
    // send back change if exist
    sendBackChange(zapInfo);
    return liquidity;
  }

  function sendBackChange(ZapInfo memory zapInfo) internal {

    uint256 assetsLength = zapInfo.assets.length;
    for (uint256 i=0; i<assetsLength; i++) {
      address asset = zapInfo.assets[i];
      uint256 balance = IERC20(asset).balanceOf(address(this));

      if (balance != 0) {
        address[] memory assetRoute = zapInfo.assetsRoutes[i];
        uint256 routesLength = assetRoute.length;
        address[] memory reverseRoute = new address[](routesLength);
        for (uint256 j = routesLength; j > 0; j--) {
          reverseRoute[routesLength - j] = assetRoute[j - 1];
        }

        callMultiSwap(
          asset,
          balance,
          reverseRoute,
          zapInfo.tokenIn,
          zapInfo.slippageTolerance
        );
      }
    }

  uint256 tokenBal = IERC20(zapInfo.tokenIn).balanceOf(address(this));
    if (tokenBal != 0) {
      IERC20(zapInfo.tokenIn).safeTransfer(msg.sender, tokenBal);
    }
  }

  function callMultiSwap(
    address _tokenIn,
    uint256 _tokenInAmount,
    address[] memory _lpRoute,
    address _tokenOut,
    uint256 slippageTolerance
  ) internal {
    if (_tokenIn == _tokenOut) {
      // no actions if we already have required token
      return;
    }
    require(_tokenInAmount <= IERC20(_tokenIn).balanceOf(address(this)), "ZC: not enough balance for multi-swap");
    IERC20(_tokenIn).safeApprove(address(multiSwap), 0);
    IERC20(_tokenIn).safeApprove(address(multiSwap), _tokenInAmount);
    multiSwap.multiSwap(_lpRoute, _tokenIn, _tokenOut, _tokenInAmount, slippageTolerance);
  }

  /// @dev Deposit into the vault, check the result and send share token to msg.sender
  function depositToVault(address _vault, uint256 _amount, address _underlying) internal {
    require(ISmartVault(_vault).underlying() == _underlying, "ZC: wrong lp for vault");

    IERC20(_underlying).safeApprove(_vault, 0);
    IERC20(_underlying).safeApprove(_vault, _amount);
    ISmartVault(_vault).deposit(_amount);

    uint256 shareBalance = IERC20(_vault).balanceOf(address(this));
    require(shareBalance != 0, "ZC: zero shareBalance");

    IERC20(_vault).safeTransfer(msg.sender, shareBalance);
  }

  /// @dev Withdraw from vault and check the result
  function withdrawFromVault(address _vault, address _underlying, uint256 _amount) internal returns (uint256){
    ISmartVault(_vault).withdraw(_amount);

    uint256 underlyingBalance = IERC20(_underlying).balanceOf(address(this));
    require(underlyingBalance != 0, "ZC: zero underlying balance");
    return underlyingBalance;
  }

  // ************************* GOV ACTIONS *******************

  /// @notice Controller or Governance can claim coins that are somehow transferred into the contract
  /// @param _token Token address
  /// @param _amount Token amount
  function salvage(address _token, uint256 _amount) external onlyControllerOrGovernance {
    IERC20(_token).safeTransfer(msg.sender, _amount);
  }

}
