// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface ISphereToken {

  function addPartyAddies(address _partyAddy, bool _value) external;

  function setAutomatedMarketMakerPair(address _pair, bool _value) external;

  function setInitialDistributionFinished(bool _value) external;

  function setPartyListDivisor(uint256 _value) external;

  function setFeeExempt(address _addr, bool _value) external;

  function setTaxNonMarketMaker(bool _value) external;

  function setTargetLiquidity(uint256 target, uint256 accuracy) external;

  function setSwapBackSettings(
    bool _enabled,
    uint256 _num,
    uint256 _denom
  ) external;

  function setFeeReceivers(
    address _liquidityReceiver,
    address _treasuryReceiver,
    address _riskFreeValueReceiver
  ) external;

  function setFees(
    uint256 _liquidityFee,
    uint256 _riskFreeValue,
    uint256 _treasuryFee,
    uint256 _burnFee,
    uint256 _sellFeeTreasuryAdded,
    uint256 _sellFeeRFVAdded,
    uint256 _sellBurnFee
  ) external;

  function setStablecoin(address _stableCoin) external;

  function setPartyIsOver() external;

  function setTaxBracketFeeMultiplier(uint256 _taxBracketFeeMultiplier) external;

  function clearStuckBalance(address _receiver) external;

  function rescueToken(address tokenAddress, uint256 tokens)
  external returns (bool success);

  function setAutoRebase(bool _autoRebase) external;

  //enable burn fee if necessary
  function setBurnFee(bool _isBurnEnabled) external;

  //disable launch fee so calculations are not necessarily made
  function setLaunchPeriod(bool _isStillLaunchPeriod) external;

  //enable burn fee if necessary
  function setTaxBracket(bool _isTaxBracketEnabled) external;

  function setRebaseFrequency(uint256 _rebaseFrequency) external;

  function setRewardYield(
    uint256 _rewardYield,
    uint256 _rewardYieldDenominator
  ) external;

  function setFeesOnNormalTransfers(bool _enabled) external;

  function setIsLiquidityInMATIC(bool _value) external;

  function setNextRebase(uint256 _nextRebase) external;

  function setMaxSellTransaction(uint256 _maxTxn) external;

  function setMaxBuyTransactionAmount(uint256 _maxTxn) external;
}
