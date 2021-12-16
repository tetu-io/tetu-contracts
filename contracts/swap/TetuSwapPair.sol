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

import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "./TetuSwapERC20.sol";
import "./libraries/UQ112x112.sol";
import "./libraries/Math.sol";
import "./libraries/TetuSwapLibrary.sol";
import "../third_party/uniswap/IUniswapV2Callee.sol";
import "../third_party/uniswap/IUniswapV2Factory.sol";
import "../third_party/IERC20Name.sol";
import "../base/interface/ISmartVault.sol";
import "./interfaces/ITetuSwapPair.sol";

/// @title Tetu swap pair based on Uniswap solution
///        Invest underlying assets to Tetu SmartVaults
/// @author belbix
contract TetuSwapPair is TetuSwapERC20, ITetuSwapPair, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using UQ112x112 for uint224;

  // ********** CONSTANTS ********************
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  uint public constant PRECISION = 10000;
  uint public constant MAX_FEE = 30;
  uint public constant override MINIMUM_LIQUIDITY = 10 ** 3;

  // ********** VARIABLES ********************
  address public override factory;
  address public override rewardRecipient;
  address public override token0;
  address public override token1;
  address public override vault0;
  address public override vault1;

  uint112 private reserve0;
  uint112 private reserve1;

  uint32 private blockTimestampLast; // uses single storage slot, accessible via getReserves
  uint public override price0CumulativeLast;
  uint public override price1CumulativeLast;
  string private _symbol;
  uint public override fee;
  uint public createdTs;
  uint public createdBlock;

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
  event FeeChanged(uint oldFee, uint newFee);
  event VaultsChanged(address vault0, address vault1);
  event RewardRecipientChanged(address oldRecipient, address newRecipient);
  event Claimed(uint blockTs);
  event Initialized(address token0, address token1, uint fee);

  /// @dev Should be create only from factory
  constructor() {
    factory = msg.sender;
  }

  modifier onlyFactory() {
    require(msg.sender == factory, "TSP: Not factory");
    _;
  }

  /// @dev Called once by the factory at time of deployment
  function initialize(
    address _token0,
    address _token1,
    uint _fee
  ) external override onlyFactory {
    require(_fee <= MAX_FEE, "TSP: Too high fee");
    require(token0 == address(0), "TSP: Already initialized");
    require(token1 == address(0), "TSP: Already initialized");
    token0 = _token0;
    token1 = _token1;
    fee = _fee;
    _symbol = createPairSymbol(IERC20Name(_token0).symbol(), IERC20Name(_token1).symbol());
    createdTs = block.timestamp;
    createdBlock = block.number;
    emit Initialized(_token0, _token1, _fee);
  }

  function symbol() external override view returns (string memory) {
    return _symbol;
  }

  /// @dev Return saved reserves. Be aware that reserves always fluctuate!
  ///      For actual values need to call update
  function getReserves() public view override returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) {
    _reserve0 = reserve0;
    _reserve1 = reserve1;
    _blockTimestampLast = blockTimestampLast;
  }

  /// @dev Update reserves and, on the first call per block, price accumulators
  function _update() private {
    uint _balance0 = vaultReserve0();
    uint _balance1 = vaultReserve1();
    require(_balance0 <= type(uint112).max && _balance1 <= type(uint112).max, "TSP: OVERFLOW");

    uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
    uint32 timeElapsed = blockTimestamp - blockTimestampLast;

    if (timeElapsed > 0 && reserve0 != 0 && reserve1 != 0) {
      price0CumulativeLast += uint(UQ112x112.encode(reserve1).uqdiv(reserve0)) * timeElapsed;
      price1CumulativeLast += uint(UQ112x112.encode(reserve0).uqdiv(reserve1)) * timeElapsed;
    }

    reserve0 = uint112(_balance0);
    reserve1 = uint112(_balance1);
    blockTimestampLast = blockTimestamp;
    emit Sync(reserve0, reserve1);
  }

  /// @dev Assume underlying tokens already sent to this contract
  ///      Mint new LP tokens to sender. Based on vault shares
  function mint(address to) external nonReentrant override returns (uint liquidity) {
    uint shareAmount0 = IERC20(vault0).balanceOf(address(this));
    uint shareAmount1 = IERC20(vault1).balanceOf(address(this));

    uint underlyingAmount0 = depositAllToVault(vault0);
    uint underlyingAmount1 = depositAllToVault(vault1);

    uint depositedAmount0 = IERC20(vault0).balanceOf(address(this)) - shareAmount0;
    uint depositedAmount1 = IERC20(vault1).balanceOf(address(this)) - shareAmount1;

    uint _totalSupply = totalSupply;
    if (_totalSupply == 0) {
      liquidity = Math.sqrt(depositedAmount0 * depositedAmount1) - MINIMUM_LIQUIDITY;
      // permanently lock the first MINIMUM_LIQUIDITY tokens
      _mint(address(0), MINIMUM_LIQUIDITY);
    } else {
      liquidity = Math.min(
        depositedAmount0 * _totalSupply / shareAmount0,
        depositedAmount1 * _totalSupply / shareAmount1
      );
    }

    require(liquidity > 0, "TSP: Insufficient liquidity minted");
    _mint(to, liquidity);

    _update();
    emit Mint(msg.sender, underlyingAmount0, underlyingAmount1);
  }

  /// @dev Assume lp token already sent to this contract
  ///      Burn LP tokens and send back underlying assets. Based on vault shares
  function burn(address to) external nonReentrant override returns (uint amount0, uint amount1) {
    require(totalSupply != 0, "TSP: Total supply is zero");
    uint shareAmount0 = IERC20(vault0).balanceOf(address(this));
    uint shareAmount1 = IERC20(vault1).balanceOf(address(this));
    uint liquidity = balanceOf[address(this)];

    uint shareToWithdraw0 = liquidity * shareAmount0 / totalSupply;
    uint shareToWithdraw1 = liquidity * shareAmount1 / totalSupply;

    require(shareToWithdraw0 > 0 && shareToWithdraw1 > 0, "TSP: Insufficient liquidity burned");
    _burn(address(this), liquidity);

    require(shareToWithdraw0 <= IERC20(vault0).balanceOf(address(this)), "TSP: Insufficient shares 0");
    require(shareToWithdraw1 <= IERC20(vault1).balanceOf(address(this)), "TSP: Insufficient shares 1");

    ISmartVault(vault0).withdraw(shareToWithdraw0);
    ISmartVault(vault1).withdraw(shareToWithdraw1);

    amount0 = IERC20(token0).balanceOf(address(this));
    amount1 = IERC20(token1).balanceOf(address(this));

    IERC20(token0).safeTransfer(to, amount0);
    IERC20(token1).safeTransfer(to, amount1);

    _update();
    emit Burn(msg.sender, amount0, amount1, to);
  }

  /// @dev Assume tokenIn already sent to this contract
  ///      During swap process underlying assets will be deposited and withdrew from vaults
  ///      Depends on vault logic, underlying asset can be deposited with little reducing of amount
  ///      For keeping healthy K we are auto-compounding 1/10 of fees
  function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external nonReentrant override {
    require(amount0Out > 0 || amount1Out > 0, "TSP: Insufficient output amount");
    (uint112 _reserve0, uint112 _reserve1,) = getReserves();
    require(amount0Out < _reserve0 && amount1Out < _reserve1, "TSP: Insufficient liquidity");

    uint expectedAmountIn0 = getAmountIn(amount1Out, _reserve0, _reserve1);
    uint expectedAmountIn1 = getAmountIn(amount0Out, _reserve1, _reserve0);

    // assume we invested all funds and have on balance only new tokens for current swap
    uint amount0In = IERC20(token0).balanceOf(address(this));
    uint amount1In = IERC20(token1).balanceOf(address(this));
    // check amountIn for cases of vault reserves fluctuations
    // we check accurate input value with required fees
    require(amount0In >= expectedAmountIn0 && amount1In >= expectedAmountIn1, "TSP: Insufficient input amount");

    if (amount0In > 0) {
      ISmartVault(vault0).deposit(amount0In);
    }
    if (amount1In > 0) {
      ISmartVault(vault1).deposit(amount1In);
    }

    {// scope for optimistically transfer output amount
      uint amountFee = 0;
      if (amount0In > amount1In) {
        amountFee = getFeeAmount(amount0In, _reserve0, _reserve1, amount1Out);
      } else {
        amountFee = getFeeAmount(amount1In, _reserve1, _reserve0, amount0Out);
      }
      _optimisticallyTransfer(amount0Out, amount1Out, to, data, amountFee);
    }

    // K value should be in a healthy range
    // in a normal circumstance not required after input amount checking
    // but kept for excluding for any possibilities of vault reserve manipulation
    {// scope for K checking
      uint balance0 = vaultReserve0();
      uint balance1 = vaultReserve1();
      // check K without fees
      require(balance0 * balance1 >= uint(_reserve0) * uint(_reserve1), "TSP: K too low");
    }

    _update();
    emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
  }

  /// @dev Force update
  function sync() external nonReentrant override {
    _update();
  }

  // ******************************************************
  // ************ NON UNISWAP FUNCTIONS *******************
  // ******************************************************

  /// @dev Returns expected input amount for given output amount
  function getAmountIn(uint amountOut, uint reserveIn, uint reserveOut) public view returns (uint amountIn){
    if (amountOut == 0) {
      return 0;
    }
    return TetuSwapLibrary.getAmountIn(amountOut, reserveIn, reserveOut, fee);
  }

  /// @dev Calculates fee amount assuming that amountOutWithFee includes actual fee
  ///      Keep 1/10 of fee for auto-compounding
  ///      In case of 0 fees we will not able to use vaults with deposited amount fluctuations
  function getFeeAmount(uint amountIn, uint reserveIn, uint reserveOut, uint amountOutWithFee) public pure returns (uint amountFee){
    if (amountIn == 0) {
      return 0;
    }
    uint amountOutWithoutFee = TetuSwapLibrary.getAmountOut(amountIn, reserveIn, reserveOut, 0);
    if (amountOutWithoutFee <= amountOutWithFee) {
      return 0;
    }
    // keep 10% for auto compounding
    amountFee = (amountOutWithoutFee - amountOutWithFee) * 9 / 10;
  }

  /// @dev Returns vault underlying balance, or zero if it is not a underlying token
  function balanceOfVaultUnderlying(address _token) external view override returns (uint){
    if (_token == ISmartVault(vault0).underlying()) {
      return ISmartVault(vault0).underlyingBalanceWithInvestmentForHolder(address(this));
    } else if (_token == ISmartVault(vault1).underlying()) {
      return ISmartVault(vault1).underlyingBalanceWithInvestmentForHolder(address(this));
    }
    return 0;
  }

  /// @dev Returns vault underlying balance for this contract
  function vaultReserve0() public view returns (uint112) {
    return uint112(ISmartVault(vault0).underlyingBalanceWithInvestmentForHolder(address(this)));
  }

  /// @dev Returns vault underlying balance for this contract
  function vaultReserve1() public view returns (uint112){
    return uint112(ISmartVault(vault1).underlyingBalanceWithInvestmentForHolder(address(this)));
  }

  // ********* GOVERNANCE FUNCTIONS ****************

  /// @dev Set fee in range 0-0.3%
  function setFee(uint _fee) external override onlyFactory {
    require(_fee <= MAX_FEE, "TSP: Too high fee");
    emit FeeChanged(fee, _fee);
    fee = _fee;
  }

  /// @dev Called by fee setter after pair initialization
  function setVaults(address _vault0, address _vault1) external override onlyFactory {
    require(ISmartVault(_vault0).underlying() == token0, "TSP: Wrong vault0 underlying");
    require(ISmartVault(_vault1).underlying() == token1, "TSP: Wrong vault1 underlying");

    exitFromVault(vault0);
    exitFromVault(vault1);

    vault0 = _vault0;
    vault1 = _vault1;

    IERC20(token0).safeApprove(_vault0, type(uint).max);
    IERC20(token1).safeApprove(_vault1, type(uint).max);

    depositAllToVault(vault0);
    depositAllToVault(vault1);
    emit VaultsChanged(vault0, vault1);
  }

  /// @dev Set rewards recipient. This address will able to claim vault rewards and get swap fees
  function setRewardRecipient(address _recipient) external override onlyFactory {
    emit RewardRecipientChanged(rewardRecipient, _recipient);
    rewardRecipient = _recipient;
  }

  /// @dev Only reward recipient able to call it
  ///      Claims vaults rewards and send it to recipient
  function claimAll() external override {
    require(msg.sender == rewardRecipient, "TSP: Only recipient can claim");
    _claim(vault0);
    _claim(vault1);
    emit Claimed(block.timestamp);
  }

  // ***************** INTERNAL LOGIC ****************

  /// @dev Transfers output amount + fees
  function _optimisticallyTransfer(
    uint amount0Out,
    uint amount1Out,
    address to,
    bytes calldata data,
    uint amountFee
  ) private {
    address _token0 = token0;
    address _token1 = token1;
    require(to != _token0 && to != _token1, "TSP: Invalid to");
    if (amount0Out > 0) {
      withdrawFromVault(vault0, amount0Out + amountFee);
      IERC20(_token0).safeTransfer(to, amount0Out);
      if (amountFee > 0) {
        IERC20(_token0).safeTransfer(rewardRecipient, amountFee);
      }
    }
    if (amount1Out > 0) {
      withdrawFromVault(vault1, amount1Out + amountFee);
      IERC20(_token1).safeTransfer(to, amount1Out);
      if (amountFee > 0) {
        IERC20(_token1).safeTransfer(rewardRecipient, amountFee);
      }
    }
    if (data.length > 0) {
      IUniswapV2Callee(to).uniswapV2Call(msg.sender, amount0Out, amount1Out, data);
    }
  }

  /// @dev Deposit all underlying tokens to given vault
  function depositAllToVault(address _vault) private returns (uint) {
    uint underlyingAmount = IERC20(ISmartVault(_vault).underlying()).balanceOf(address(this));
    if (underlyingAmount > 0) {
      ISmartVault(_vault).deposit(underlyingAmount);
    }
    return underlyingAmount;
  }

  /// @dev Exit from given vault and set approve to zero for underlying token
  function exitFromVault(address _vault) private {
    if (_vault == address(0)) {
      return;
    }
    uint balance = IERC20(_vault).balanceOf(address(this));
    if (balance > 0) {
      ISmartVault(_vault).withdraw(balance);
    }
    IERC20(ISmartVault(_vault).underlying()).safeApprove(_vault, 0);
  }

  /// @dev Withdraw approx amount of underlying amount from given vault
  function withdrawFromVault(address _vault, uint _underlyingAmount) private {
    ISmartVault sv = ISmartVault(_vault);
    uint shareBalance = IERC20(_vault).balanceOf(address(this));
    uint shareToWithdraw = _underlyingAmount * sv.underlyingUnit() / sv.getPricePerFullShare();
    // add 1 for avoiding rounding issues
    shareToWithdraw = Math.min(shareToWithdraw + 1, shareBalance);
    require(shareToWithdraw <= shareBalance, "TSP: Insufficient shares");
    sv.withdraw(shareToWithdraw);
  }

  /// @dev Creates symbol string from given names
  function createPairSymbol(string memory name0, string memory name1) private pure returns (string memory) {
    return string(abi.encodePacked("TLP_", name0, "_", name1));
  }

  /// @dev Claim all rewards from given vault and send to reward recipient
  function _claim(address _vault) private {
    require(_vault != address(0), "TSP: Zero vault");
    ISmartVault sv = ISmartVault(_vault);

    for (uint i = 0; i < sv.rewardTokensLength(); i++) {
      address rt = sv.rewardTokens()[i];
      uint bal = IERC20(rt).balanceOf(address(this));
      sv.getReward(rt);
      uint claimed = IERC20(rt).balanceOf(address(this)) - bal;
      if (claimed > 0) {
        IERC20(rt).safeTransfer(rewardRecipient, claimed);
      }
    }
  }
}
