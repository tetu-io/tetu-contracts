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

import "./ControllableV2.sol";
import "./ForwarderV2Storage.sol";
import "../../openzeppelin/IERC20.sol";
import "../../openzeppelin/SafeERC20.sol";
import "../interfaces/ISmartVault.sol";
import "../interfaces/IBookkeeper.sol";
import "../../third_party/uniswap/IUniswapV2Router02.sol";
import "../../third_party/uniswap/IUniswapV2Factory.sol";
import "../../third_party/IVeDistributor.sol";
import "../SlotsLib.sol";
import "../interfaces/ITetuLiquidator.sol";

/// @title Convert rewards from external projects to TETU and FundToken(USDC by default)
///        and send them to veTETU distributor, FundKeeper and vaults
/// @author belbix
/// @author bogdoslav
contract ForwarderV2 is ControllableV2, ForwarderV2Storage {
  using SafeERC20 for IERC20;
  using SlotsLib for bytes32;

  // ************ CONSTANTS **********************

  /// @notice Version of the contract
  /// @dev Should be incremented when contract is changed
  string public constant override VERSION = "1.6.0";
  uint256 public constant override LIQUIDITY_DENOMINATOR = 100;
  uint constant public override SLIPPAGE_DENOMINATOR = 100;
  uint constant public override MINIMUM_AMOUNT = 100;
  uint public constant PRICE_IMPACT_TOLERANCE = 5_000;

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
    ControllableV2.initializeControllable(_controller);
  }

  /// @dev Allow operation only for Controller or Governance
  modifier onlyGov() {
    require(_isGovernance(msg.sender), "F2: Not gov");
    _;
  }

  /// @dev Only Reward Distributor allowed. Governance is Reward Distributor by default.
  modifier onlyRewardDistribution() {
    require(IController(_controller()).isRewardDistributor(msg.sender), "F2: Only distributor");
    _;
  }

  // ***************** VIEW ************************

  /// @notice Return FundKeeper address
  /// @return FundKeeper address
  function fund() public view override returns (address) {
    return IController(_controller()).fund();
  }

  /// @notice Return Target token (TETU) address
  /// @return Target token (TETU) address
  function tetu() public view override returns (address) {
    return IController(_controller()).rewardToken();
  }

  /// @notice Return a token address used for FundKeeper (USDC by default)
  /// @return FundKeeper's main token address (USDC by default)
  function fundToken() public view override returns (address) {
    return IController(_controller()).fundToken();
  }

  /// @notice Return slippage numerator
  function slippageNumerator() public view override returns (uint) {
    return _slippageNumerator();
  }

  // ************ GOVERNANCE ACTIONS **************************

  /// @notice Only Governance can call it.
  ///         Sets numerator for a part of profit that goes instead of PS to TETU liquidity
  function setLiquidityNumerator(uint256 _value) external onlyGov {
    require(_value <= LIQUIDITY_DENOMINATOR, "F2: Too high value");
    _setLiquidityNumerator(_value);
  }

  /// @notice Only Governance can call it.
  ///         Sets numerator for slippage value. Must be in a range 0-100
  function setSlippageNumerator(uint256 _value) external onlyGov {
    require(_value <= SLIPPAGE_DENOMINATOR, "F2: Too high value");
    _setSlippageNumerator(_value);
  }

  /// @notice Only Governance can call it.
  ///         Sets router for a pair with TETU liquidity
  function setLiquidityRouter(address _value) external onlyGov {
    _setLiquidityRouter(_value);
  }

  /// @notice Only Governance can call it.
  ///         Sets liquidation threshold in token value for given token.
  function setTokenThreshold(address tokenIn, uint value) external onlyGov {
    require(tokenIn != address(0), "F2: Zero token");
    tokenThreshold[tokenIn] = value;
  }

  /// @notice Only Governance can call it.
  ///         Sets TetuLiquidator address
  function setLiquidator(address value) external onlyGov {
    require(value != address(0), "F2: Zero adr");
    liquidator = value;
  }

  /// @notice Only Governance can call it.
  ///         Sets veDist for profit sharing
  function setVeDist(address value) external onlyGov {
    require(value != address(0), "F2: Zero adr");
    _setVeDist(value);
  }

  // ***************** EXTERNAL *******************************

  /// @notice Send internal balance (if accumulate some dust) to FundKeeper/xTETU
  function sendExcessTokens() external {
    _sendExcessTokens();
  }

  /// @notice Only Reward Distributor or Governance or Controller can call it.
  ///         Distribute rewards for given vault, move fees to veDist and FundKeeper
  ///         Under normal circumstances, sender is a strategy
  /// @param _amount Amount of tokens for distribute
  /// @param _token Token for distribute
  /// @param _vault Target vault
  /// @return Amount of distributed Target(TETU) tokens + FundKeeper fee (approx)
  function distribute(
    uint256 _amount,
    address _token,
    address _vault
  ) external override onlyRewardDistribution returns (uint256){
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


    (uint fundTokenAmount,) = _liquidate(_token, fundToken(), fundTokenRequires);
    uint sentToFund = _sendToFund(fundTokenAmount, toFund, toLiqFundTokenPart);

    (uint tetuTokenAmount,) = _liquidate(_token, tetu(), tetuTokenRequires);

    uint256 tetuDistributed = 0;
    if (tetuTokenAmount > 0 && fundTokenAmount > 0 && toPsAndLiq > MINIMUM_AMOUNT && fundTokenAmount >= sentToFund) {
      tetuDistributed += _sendToPsAndLiquidity(
        tetuTokenAmount,
        toLiqTetuTokenPart,
        toPs,
        toVault,
        fundTokenAmount - sentToFund
      );
    }
    if (tetuTokenAmount > 0 && fundTokenAmount > 0 && toVault > MINIMUM_AMOUNT) {
      tetuDistributed += _sendToVault(
        _vault,
        tetuTokenAmount,
        toLiqTetuTokenPart,
        toPs,
        toVault
      );
    }
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
    (uint256 resultAmount,) = _liquidate(tokenIn, tokenOut, amount);
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
    address _fundToken = fundToken();
    address _fund = fund();
    uint excessFundToken = IERC20(_fundToken).balanceOf(address(this));
    if (excessFundToken > MINIMUM_AMOUNT && _fund != address(0)) {
      IERC20(_fundToken).safeTransfer(_fund, excessFundToken);
      IBookkeeper(IController(_controller()).bookkeeper())
      .registerFundKeeperEarned(_fundToken, excessFundToken);
      emit FeeMovedToFund(_fund, _fundToken, excessFundToken);
    }
    address _tetu = tetu();
    uint excessTetuToken = IERC20(_tetu).balanceOf(address(this));
    if (excessTetuToken > MINIMUM_AMOUNT) {
      address _veDist = veDist();
      IERC20(_tetu).safeTransfer(_veDist, excessTetuToken);
      emit FeeMovedToPs(_veDist, _tetu, excessTetuToken);
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
      address _tetu = tetu();
      address _veDist = veDist();
      IERC20(_tetu).safeTransfer(_veDist, toPs);
      IVeDistributor(_veDist).checkpoint();
      emit FeeMovedToPs(_veDist, _tetu, toPs);
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
    address _tetu = tetu();
    ISmartVault smartVault = ISmartVault(_vault);
    address[] memory rts = smartVault.rewardTokens();

    address rt;
    for (uint i; i < rts.length; ++i) {
      if (rts[i] == _tetu) {
        rt = _tetu;
        break;
      }
    }
    require(rt != address(0), "F2: No TETU rt");

    uint baseSum = baseToLiqTetuTokenPart + baseToPs + baseToVault;
    uint toVault = tetuTokenAmount * baseToVault / baseSum;
    // no actions if little amount
    if (toVault < MINIMUM_AMOUNT) {
      return 0;
    }

    uint256 amountToSend = toVault;

    _approveIfNeed(rt, _vault, amountToSend);
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
    address _fund = fund();
    require(_fund != address(0), "F2: Fund is zero");

    address _fundToken = fundToken();
    IERC20(_fundToken).safeTransfer(_fund, toFund);

    IBookkeeper(IController(_controller()).bookkeeper())
    .registerFundKeeperEarned(_fundToken, toFund);
    emit FeeMovedToFund(_fund, _fundToken, toFund);
    return toFund;
  }

  function _sendToLiquidity(uint toLiqTetuTokenPart, uint toLiqFundTokenPart) internal returns (uint256) {
    // no actions if we don't have a fee for liquidity
    if (toLiqTetuTokenPart < MINIMUM_AMOUNT || toLiqFundTokenPart < MINIMUM_AMOUNT) {
      return 0;
    }
    address _tetu = tetu();
    address _fundToken = fundToken();
    uint256 lpAmount = _addLiquidity(
      liquidityRouter(),
      _fundToken,
      _tetu,
      toLiqFundTokenPart,
      toLiqTetuTokenPart
    );

    require(lpAmount != 0, "F2: Liq: Zero LP amount");

    address liquidityPair = IUniswapV2Factory(IUniswapV2Router02(liquidityRouter()).factory())
    .getPair(_fundToken, _tetu);

    IERC20(liquidityPair).safeTransfer(fund(), lpAmount);
    return toLiqTetuTokenPart * 2;
  }

  /// @dev Compute amount for FundKeeper based on Fund ratio from Controller
  /// @param _amount 100% Amount
  /// @return Percent of total amount
  function _toFundAmount(uint256 _amount) internal view returns (uint256) {
    uint256 fundNumerator = IController(_controller()).fundNumerator();
    uint256 fundDenominator = IController(_controller()).fundDenominator();
    return _amount * fundNumerator / fundDenominator;
  }

  /// @dev Compute amount for Profit Sharing vault based Controller settings
  /// @param _amount 100% Amount
  /// @return Percent of total amount
  function _toPsAndLiqAmount(uint _amount) internal view returns (uint) {
    uint256 psNumerator = IController(_controller()).psNumerator();
    uint256 psDenominator = IController(_controller()).psDenominator();
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
    uint256 fundNumerator = IController(_controller()).fundNumerator();
    uint256 fundDenominator = IController(_controller()).fundDenominator();
    return _amount * fundDenominator / (fundDenominator - fundNumerator);
  }

  function _liquidate(
    address tokenIn,
    address tokenOut,
    uint amount
  ) internal returns (uint bought, uint tokenInUsdValue) {
    if (tokenIn == tokenOut) {
      return (amount, amount);
    }

    bought = 0;

    ITetuLiquidator _liquidator = ITetuLiquidator(liquidator);

    (ITetuLiquidator.PoolData[] memory route, string memory error)
    = _liquidator.buildRoute(tokenIn, tokenOut);

    if (route.length == 0) {
      revert(error);
    }

    // calculate usd value for check threshold
    tokenInUsdValue = _liquidator.getPriceForRoute(route, amount);

    // if the value higher than threshold distribute to destinations
    if (tokenInUsdValue > tokenThreshold[tokenIn]) {

      uint tokenOutBalanceBefore = IERC20(tokenOut).balanceOf(address(this));

      _approveIfNeed(tokenIn, address(_liquidator), amount);
      _liquidator.liquidateWithRoute(route, amount, PRICE_IMPACT_TOLERANCE);

      bought = IERC20(tokenOut).balanceOf(address(this)) - tokenOutBalanceBefore;
    } else {
      // send to controller in case if too low amount
      IERC20(tokenIn).safeTransfer(_controller(), amount);
    }
  }

  function _addLiquidity(
    address _router,
    address _token0,
    address _token1,
    uint256 _token0Amount,
    uint256 _token1Amount
  ) internal returns (uint256) {
    _approveIfNeed(_token0, _router, _token0Amount);
    _approveIfNeed(_token1, _router, _token1Amount);

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

  function _approveIfNeed(address token, address dst, uint amount) internal {
    if (IERC20(token).allowance(address(this), dst) < amount) {
      IERC20(token).safeApprove(dst, 0);
      IERC20(token).safeApprove(dst, type(uint).max);
    }
  }
}
