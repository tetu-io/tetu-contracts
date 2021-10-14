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
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import "./TetuSwapERC20.sol";
import "./libraries/UQ112x112.sol";
import "./libraries/Math.sol";
import "../third_party/uniswap/IUniswapV2Callee.sol";
import "../third_party/uniswap/IUniswapV2Factory.sol";
import "../third_party/IERC20Name.sol";
import "../base/interface/ISmartVault.sol";
import "./interfaces/ITetuSwapPair.sol";
import "./libraries/TetuSwapLibrary.sol";

import "hardhat/console.sol";

/// @title Tetu swap pair based on Uniswap solution
/// @author belbix
contract TetuSwapPair is TetuSwapERC20, ITetuSwapPair, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using UQ112x112 for uint224;

  // ********** CONSTANTS ********************
  uint public constant PRECISION = 10000;
  uint public constant K_TOLERANCE = 1;
  uint public constant override MINIMUM_LIQUIDITY = 10 ** 3;

  // ********** VARIABLES ********************
  address public override factory;
  address public override token0;
  address public override token1;
  address public override vault0;
  address public override vault1;

  uint112 private shareReserve0;
  uint112 private shareReserve1;

  uint32 private blockTimestampLast; // uses single storage slot, accessible via getReserves
  uint public override price0CumulativeLast;
  uint public override price1CumulativeLast;
  uint public override kLast; // reserve0 * reserve1, as of immediately after the most recent liquidity event
  string private _symbol;

  // ********** EVENTS ********************

  event Mint(address indexed sender, uint amount0, uint amount1);
  event Burn(address indexed sender, uint amount0, uint amount1, address indexed to);
  event Swap(
    address indexed sender,
    uint amount0In,
    uint amount1In,
    uint amount0Out,
    uint amount1Out,
    address indexed to
  );
  event Sync(uint112 reserve0, uint112 reserve1);

  /// @dev Should be create only from factory
  constructor() {
    factory = msg.sender;
  }

  /// @dev Called once by the factory at time of deployment
  function initialize(address _token0, address _token1) external override {
    require(msg.sender == factory, "TSP: Not factory");
    // sufficient check
    token0 = _token0;
    token1 = _token1;
    _symbol = createPairSymbol(IERC20Name(_token0).symbol(), IERC20Name(_token1).symbol());
  }

  function symbol() external override view returns (string memory) {
    return _symbol;
  }

  function getReserves() public view override returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
    _reserve0 = vaultReserve0();
    _reserve1 = vaultReserve1();
    _blockTimestampLast = blockTimestampLast;
  }

  /// @dev Update reserves and, on the first call per block, price accumulators
  function _update() private {
    uint _shareBalance0 = IERC20(vault0).balanceOf(address(this));
    uint _shareBalance1 = IERC20(vault1).balanceOf(address(this));
    require(_shareBalance0 <= type(uint112).max && _shareBalance1 <= type(uint112).max, "TSP: OVERFLOW");

    uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
    uint32 timeElapsed = blockTimestamp - blockTimestampLast;

    if (timeElapsed > 0 && shareReserve0 != 0 && shareReserve1 != 0) {
      price0CumulativeLast += uint(UQ112x112.encode(shareReserve1).uqdiv(shareReserve0)) * timeElapsed;
      price1CumulativeLast += uint(UQ112x112.encode(shareReserve0).uqdiv(shareReserve1)) * timeElapsed;
    }

    shareReserve0 = uint112(_shareBalance0);
    shareReserve1 = uint112(_shareBalance1);
    blockTimestampLast = blockTimestamp;
    emit Sync(vaultReserve0(), vaultReserve1());
  }

  function mint(address to) external nonReentrant override returns (uint liquidity) {
    console.log("########## MINT ##################");
    uint underlyingAmount0 = IERC20(token0).balanceOf(address(this));
    uint underlyingAmount1 = IERC20(token1).balanceOf(address(this));

    console.log("MINT: underlyingAmount0", underlyingAmount0);
    console.log("MINT: underlyingAmount1", underlyingAmount1);

    uint shareAmount0 = IERC20(vault0).balanceOf(address(this));
    uint shareAmount1 = IERC20(vault1).balanceOf(address(this));

    console.log("MINT: shareAmount0", shareAmount0);
    console.log("MINT: shareAmount1", shareAmount1);

    ISmartVault(vault0).deposit(underlyingAmount0);
    ISmartVault(vault1).deposit(underlyingAmount1);

    console.log("MINT: underlyingAmount0 after", IERC20(token0).balanceOf(address(this)));
    console.log("MINT: underlyingAmount1 after", IERC20(token1).balanceOf(address(this)));

    uint depositedAmount0 = IERC20(vault0).balanceOf(address(this)) - shareAmount0;
    uint depositedAmount1 = IERC20(vault1).balanceOf(address(this)) - shareAmount1;

    console.log("MINT: depositedAmount0", depositedAmount0);
    console.log("MINT: depositedAmount1", depositedAmount1);

    uint _totalSupply = totalSupply;
    if (_totalSupply == 0) {
      liquidity = Math.sqrt(depositedAmount0 * depositedAmount1) - MINIMUM_LIQUIDITY;
      _mint(address(0), MINIMUM_LIQUIDITY);
      // permanently lock the first MINIMUM_LIQUIDITY tokens
    } else {
      liquidity = Math.min(
        depositedAmount0 * _totalSupply / shareAmount0,
        depositedAmount1 * _totalSupply / shareAmount1
      );
    }

    console.log("MINT: _totalSupply", _totalSupply);
    console.log("MINT: liquidity", liquidity);

    require(liquidity > 0, "TSP: Insufficient liquidity minted");
    _mint(to, liquidity);

    _update();
    updateLastK();
    // reserve0 and reserve1 are up-to-date
    emit Mint(msg.sender, underlyingAmount0, underlyingAmount1);
    console.log("############################");
  }

  function burn(address to) external nonReentrant override returns (uint amount0, uint amount1) {
    console.log("########## BURN ##################");
    uint shareAmount0 = IERC20(vault0).balanceOf(address(this));
    uint shareAmount1 = IERC20(vault1).balanceOf(address(this));
    uint liquidity = balanceOf[address(this)];

    uint shareToWithdraw0 = liquidity * shareAmount0 / totalSupply;
    uint shareToWithdraw1 = liquidity * shareAmount1 / totalSupply;

    require(shareToWithdraw0 > 0 && shareToWithdraw1 > 0, "TSP: Insufficient liquidity burned");
    _burn(address(this), liquidity);

    ISmartVault(vault0).withdraw(shareToWithdraw0);
    ISmartVault(vault1).withdraw(shareToWithdraw1);

    amount0 = IERC20(token0).balanceOf(address(this));
    amount1 = IERC20(token1).balanceOf(address(this));

    IERC20(token0).safeTransfer(to, amount0);
    IERC20(token1).safeTransfer(to, amount1);

    _update();
    updateLastK();
    emit Burn(msg.sender, amount0, amount1, to);
    console.log("############################");
  }

  /// @dev Assume tokenIn already sent to this contract
  function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external nonReentrant override {
    console.log("########## SWAP ##################");
    console.log("SWAP: amount0Out before", amount0Out);
    console.log("SWAP: amount1Out before", amount1Out);

    require(amount0Out > 0 || amount1Out > 0, "TSP: Insufficient output amount");
    (uint112 _reserve0, uint112 _reserve1,) = getReserves();
    require(amount0Out < _reserve0 && amount1Out < _reserve1, "TSP: Insufficient liquidity");


    console.log("SWAP: _reserve0", _reserve0);
    console.log("SWAP: _reserve1", _reserve1);


    uint expectedAmountIn0 = getAmountIn(amount1Out, _reserve0, _reserve1);
    uint expectedAmountIn1 = getAmountIn(amount0Out, _reserve1, _reserve0);

    // assume we invested all funds and have on balance only new tokens for current swap
    uint amount0In = IERC20(token0).balanceOf(address(this));
    uint amount1In = IERC20(token1).balanceOf(address(this));
    console.log("SWAP: amount0In", amount0In);
    console.log("SWAP: expectedAmountIn0", expectedAmountIn0);
    console.log("SWAP: amount0In", amount1In);
    console.log("SWAP: expectedAmountIn1", expectedAmountIn1);
    require(amount0In >= expectedAmountIn0 && amount1In >= expectedAmountIn1, "TSP: Insufficient input amount");

    if (amount0In > 0) {
      console.log("SWAP: deposit 0", amount0In);
      ISmartVault(vault0).deposit(amount0In);
    }
    if (amount1In > 0) {
      console.log("SWAP: deposit 1", amount1In);
      ISmartVault(vault1).deposit(amount1In);
    }


    _optimisticallyTransfer(amount0Out, amount1Out, to, data);


    // K value should be in healthy range
    {// scope for reserve{0,1}Adjusted, avoids stack too deep errors
      uint balance0 = vaultReserve0();
      uint balance1 = vaultReserve1();
      uint input0 = 0;
      uint input1 = 0;
      if (balance0 > _reserve0) {
        input0 = balance0 - _reserve0;
      }
      if (balance1 > _reserve1) {
        input1 = balance1 - _reserve1;
      }
      uint balance0Adjusted = (balance0 * PRECISION) - (input0 * K_TOLERANCE);
      uint balance1Adjusted = (balance1 * PRECISION) - (input1 * K_TOLERANCE);

      console.log("SWAP: K ---------------------");
      console.log("SWAP: K: balance0", balance0);
      console.log("SWAP: K: balance1", balance1);
      console.log("SWAP: K: input0", input0);
      console.log("SWAP: K: input1", input1);
      console.log("SWAP: K: amount0In", amount0In);
      console.log("SWAP: K: amount1In", amount1In);
      console.log("SWAP: K: balance0Adjusted", balance0Adjusted);
      console.log("SWAP: K: balance1Adjusted", balance1Adjusted);
      console.log("SWAP: K: new K", balance0Adjusted * balance1Adjusted);
      console.log("SWAP: K: old K", uint(_reserve0) * uint(_reserve1) * (PRECISION ** 2));
      console.log("SWAP: ---");
      console.log("SWAP: K: new K2", balance0 * balance1);
      console.log("SWAP: K: old K2", uint(_reserve0) * uint(_reserve1));
      console.log("------------------------------");

      // check K without care about fees
      require(balance0 * balance1 >= uint(_reserve0) * uint(_reserve1), "TSP: K too low");
    }

    _update();
    emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    console.log("############################");
  }

  /// @dev Force update
  function sync() external nonReentrant override {
    _update();
  }

  // ************ NON UNISWAP FUNCTIONS *******************

  function _optimisticallyTransfer(uint amount0Out, uint amount1Out, address to, bytes calldata data) private {
    address _token0 = token0;
    address _token1 = token1;
    require(to != _token0 && to != _token1, "TSP: Invalid to");
    if (amount0Out > 0) {
      withdrawFromVault(vault0, amount0Out);
      IERC20(_token0).safeTransfer(to, amount0Out);
    }
    if (amount1Out > 0) {
      withdrawFromVault(vault1, amount1Out);
      IERC20(_token1).safeTransfer(to, amount1Out);
    }
    if (data.length > 0) {
      IUniswapV2Callee(to).uniswapV2Call(msg.sender, amount0Out, amount1Out, data);
    }
  }

  /// @dev Called by fee setter after pair initialization
  function setVaults(address _vault0, address _vault1) external override {
    require(msg.sender == factory, "TSP: Not factory");

    require(ISmartVault(_vault0).underlying() == token0, "TSP: Wrong vault0 underlying");
    require(ISmartVault(_vault1).underlying() == token1, "TSP: Wrong vault1 underlying");

    vault0 = _vault0;
    vault1 = _vault1;

    IERC20(token0).safeApprove(_vault0, type(uint).max);
    IERC20(token1).safeApprove(_vault1, type(uint).max);
  }

  function withdrawFromVault(address _vault, uint _underlyingAmount) private {
    ISmartVault sv = ISmartVault(_vault);
    uint shareToWithdraw = _underlyingAmount * sv.underlyingUnit() / sv.getPricePerFullShare();
    require(shareToWithdraw <= IERC20(_vault).balanceOf(address(this)), "TSP: Insufficient shares");
    sv.withdraw(shareToWithdraw);
  }

  function vaultReserve0() private view returns (uint112) {
    return uint112(ISmartVault(vault0).underlyingBalanceWithInvestmentForHolder(address(this)));
  }

  function vaultReserve1() private view returns (uint112){
    return uint112(ISmartVault(vault1).underlyingBalanceWithInvestmentForHolder(address(this)));
  }

  function updateLastK() private {
    if (IUniswapV2Factory(factory).feeTo() != address(0)) {
      kLast = uint(shareReserve0) * uint(shareReserve1);
    }
  }

  function createPairSymbol(string memory name0, string memory name1) internal pure returns (string memory) {
    return string(abi.encodePacked("TLP_", name0, "_", name1));
  }

  function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) public pure returns (uint amountIn){
    if (amountOut == 0) {
      return 0;
    }
    return TetuSwapLibrary.getAmountIn(amountOut, reserveIn, reserveOut);
  }
}
