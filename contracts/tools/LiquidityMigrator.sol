// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import "../third_party/balancer/IBVault.sol";
import "../openzeppelin/SafeERC20.sol";
import "../third_party/uniswap/IUniswapV2Pair.sol";
import "../openzeppelin/Strings.sol";

contract LiquidityMigrator {
  using SafeERC20 for IERC20;

  // *********** CONSTANTS *************

  address public constant UNI2_POOL = 0x80fF4e4153883d770204607eb4aF9994739C72DC;
  address public constant USDC = 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174;
  address public constant TETU = 0x255707B70BF90aa112006E1b07B9AeA6De021424;
  bytes32 public constant BALANCER_POOL_ID = 0xe2f706ef1f7240b803aae877c9c762644bb808d80002000000000000000008c2;
  address public constant BALANCER_POOL_ADDRESS = 0xE2f706EF1f7240b803AAe877C9C762644bb808d8;
  IBVault public constant BALANCER_VAULT = IBVault(0xBA12222222228d8Ba445958a75a0704d566BF2C8);

  // *********** VARIABLES *************

  address public owner;
  address public pendingOwner;

  // *********** INIT *************

  constructor() {
    owner = msg.sender;
  }

  // *********** RESTRICTIONS *************

  modifier onlyOwner() {
    require(owner == msg.sender, "!owner");
    _;
  }

  // *********** GOV *************

  function offerOwnership(address value) external onlyOwner {
    pendingOwner = value;
  }

  function acceptOwnership() external {
    require(msg.sender == pendingOwner, "!owner");
    owner = msg.sender;
  }

  function withdraw(address token, address recipient) external onlyOwner {
    IERC20(token).safeTransfer(recipient, IERC20(token).balanceOf(address(this)));
  }

  // *********** MAIN LOGIC *************

  function migrate(uint percent, bool extraTetu) external onlyOwner {
    // community approved to use additional TETU from rewards
    require(extraTetu, "only with extra tetu");
    _uni2Exit(IERC20(UNI2_POOL).balanceOf(address(this)) * percent / 100);
    _balancerJoin(extraTetu);
  }

  function buyBack(uint percent) external onlyOwner {
    _buyBack(percent);
  }

  function _uni2Exit(uint amount) internal {
    IERC20(UNI2_POOL).safeTransfer(UNI2_POOL, amount);
    IUniswapV2Pair(UNI2_POOL).burn(address(this));
  }

  function _calcBptAmounts(bool extraTetu) public view returns (IAsset[] memory _poolTokens, uint[] memory amounts, uint price) {
    uint usdcBal = IERC20(USDC).balanceOf(address(this));
    uint tetuBal = IERC20(TETU).balanceOf(address(this));

    (
    IERC20[] memory tokens,
    uint256[] memory balances,
    ) = BALANCER_VAULT.getPoolTokens(BALANCER_POOL_ID);

    uint tetuInPool;
    uint usdcInPool;
    uint tetuIndex;
    uint usdcIndex;

    for (uint i; i < tokens.length; ++i) {
      if (address(tokens[i]) == USDC) {
        usdcInPool = balances[i];
        usdcIndex = i;
      }
      if (address(tokens[i]) == TETU) {
        tetuInPool = balances[i];
        tetuIndex = i;
      }
    }
    price = (usdcInPool * 5 * 1e36) / (tetuInPool * 5 / 4);
    if (extraTetu) {
      uint expectedTetu = (((usdcInPool + usdcBal) * 5 * 1e36) / price) * 4 / 5 - tetuInPool;

      require(expectedTetu <= tetuBal, string(abi.encodePacked("Not enough TETU, need: ", Strings.toString(expectedTetu / 1e18))));

      amounts = new uint[](2);
      amounts[tetuIndex] = expectedTetu;
      amounts[usdcIndex] = usdcBal;
    } else {
      uint expectedUsdc = (((tetuInPool + tetuBal) * 5 / 4) * price) / 1e36 / 5 - usdcInPool;

      require(expectedUsdc <= usdcBal, string(abi.encodePacked("Not enough USDC, need: ", Strings.toString(expectedUsdc / 1e6))));

      amounts = new uint[](2);
      amounts[tetuIndex] = tetuBal;
      amounts[usdcIndex] = expectedUsdc;
    }

    _poolTokens = new IAsset[](2);
    _poolTokens[tetuIndex] = IAsset(TETU);
    _poolTokens[usdcIndex] = IAsset(USDC);
  }

  function _buyBack(uint percent) internal {
    uint usdcBal = IERC20(USDC).balanceOf(address(this)) * percent / 100;
    _balancerSwap(USDC, TETU, usdcBal);
    _balancerJoin(false);
  }

  function _balancerJoin(bool extraTetu) internal {

    (IAsset[] memory _poolTokens, uint[] memory amounts, uint price) = _calcBptAmounts(extraTetu);

    for (uint i; i < _poolTokens.length; ++i) {
      _approveIfNeeds(address(_poolTokens[i]), amounts[i], address(BALANCER_VAULT));
    }

    bytes memory userData = abi.encode(1, amounts, 1);
    IBVault.JoinPoolRequest memory request = IBVault.JoinPoolRequest({
    assets : _poolTokens,
    maxAmountsIn : amounts,
    userData : userData,
    fromInternalBalance : false
    });
    BALANCER_VAULT.joinPool(BALANCER_POOL_ID, address(this), address(this), request);

    (
    IERC20[] memory tokens,
    uint256[] memory balances,
    ) = BALANCER_VAULT.getPoolTokens(BALANCER_POOL_ID);

    uint tetuInPool;
    uint usdcInPool;

    for (uint i; i < tokens.length; ++i) {
      if (address(tokens[i]) == USDC) {
        usdcInPool = balances[i];
      }
      if (address(tokens[i]) == TETU) {
        tetuInPool = balances[i];
      }
    }

    uint priceAfter = (usdcInPool * 5 * 1e36) / (tetuInPool * 5 / 4);
    uint diff = priceAfter >= price ? priceAfter - price : price - priceAfter;
    require(diff * 1e18 / priceAfter < 1e15, string(abi.encodePacked("Price diff: ", Strings.toString(diff * 1e18 / priceAfter))));
  }

  function _balancerSwap(address _tokenIn, address _tokenOut, uint _amountIn) internal {
    if (_amountIn != 0) {
      IBVault.SingleSwap memory singleSwapData = IBVault.SingleSwap({
      poolId : BALANCER_POOL_ID,
      kind : IBVault.SwapKind.GIVEN_IN,
      assetIn : IAsset(_tokenIn),
      assetOut : IAsset(_tokenOut),
      amount : _amountIn,
      userData : ""
      });

      IBVault.FundManagement memory fundManagementStruct = IBVault.FundManagement({
      sender : address(this),
      fromInternalBalance : false,
      recipient : payable(address(this)),
      toInternalBalance : false
      });

      _approveIfNeeds(_tokenIn, _amountIn, address(BALANCER_VAULT));
      BALANCER_VAULT.swap(singleSwapData, fundManagementStruct, 1, block.timestamp);
    }
  }

  function _approveIfNeeds(address token, uint amount, address spender) internal {
    if (IERC20(token).allowance(address(this), spender) < amount) {
      IERC20(token).safeApprove(spender, 0);
      IERC20(token).safeApprove(spender, type(uint).max);
    }
  }

}
