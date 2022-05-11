// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

interface ISphereToken {

  function _disallowedToMove(address) external view returns (bool);

  function addLPAddressesForDynamicTax(address _lpContract, bool _value)
  external;

  function addPartyAddies(
    address _partyAddy,
    bool _value,
    uint256 feeAmount
  ) external;

  function addSphereGamesAddies(address _sphereGamesAddy, bool _value)
  external;

  function addSubContracts(address _subContract, bool _value) external;

  function allowance(address owner_, address spender)
  external
  view
  returns (uint256);

  function approve(address spender, uint256 value) external returns (bool);

  function autoRebase() external view returns (bool);

  function automatedMarketMakerPairs(address) external view returns (bool);

  function balanceOf(address who) external view returns (uint256);

  function canRebase(address) external view returns (bool);

  function canSetRewardYield(address) external view returns (bool);

  function clearStuckBalance(address _receiver) external;

  function decimals() external view returns (uint8);

  function decreaseAllowance(address spender, uint256 subtractedValue)
  external
  returns (bool);

  function galaxyBondReceiver() external view returns (address);

  function getBalanceContracts(address sender)
  external
  view
  returns (uint256);

  function getCirculatingSupply() external view returns (uint256);

  function getCurrentTaxBracket(address _address)
  external
  view
  returns (uint256);

  function getLastPeriodWithdrawals(address _address)
  external
  view
  returns (uint256 totalWithdrawLastHour);

  function getTokensInLPCirculation() external view returns (uint256);

  function getUserTotalOnDifferentContractsSphere(address sender)
  external
  view
  returns (uint256);

  function goDeflationary() external view returns (bool);

  function gonsPerFragment() external view returns (uint256);

  function increaseAllowance(address spender, uint256 addedValue)
  external
  returns (bool);

  function index() external view returns (uint256);

  function init() external;

  function initialDistributionFinished() external view returns (bool);

  function investRemovalDelay() external view returns (uint256);

  function investorInfoMap(address)
  external
  view
  returns (uint256 totalInvestableExchanged);

  function isBuyFeeExempt(address) external view returns (bool);

  function isLiquidityEnabled() external view returns (bool);

  function isMoveBalance() external view returns (bool);

  function isSellFeeExempt(address) external view returns (bool);

  function isSellHourlyLimit() external view returns (bool);

  function isTaxBracket() external view returns (bool);

  function isTotalFeeExempt(address) external view returns (bool);

  function isWall() external view returns (bool);

  function liquidityReceiver() external view returns (address);

  function lpContractCheck(address) external view returns (bool);

  function lpContracts(uint256) external view returns (address);

  function makerPairs(uint256) external view returns (address);

  function manualRebase() external;

  function manualSync() external;

  function markerPairCount() external view returns (uint256);

  function maxBuyTransactionAmount() external view returns (uint256);

  function maxSellTransactionAmount() external view returns (uint256);

  function moveBalance(address _to) external returns (bool);

  function name() external view returns (string memory);

  function nextRebase() external view returns (uint256);

  function owner() external view returns (address);

  function partyArray(uint256) external view returns (address);

  function partyArrayCheck(address) external view returns (bool);

  function partyArrayFee(address) external view returns (uint256);

  function partyListDivisor() external view returns (uint256);

  function partyTime() external view returns (bool);

  function rebaseEpoch() external view returns (uint256);

  function rebaseFrequency() external view returns (uint256);

  function renounceOwnership() external;

  function rescueToken(address tokenAddress) external;

  function rewardYield() external view returns (uint256);

  function rewardYieldDenominator() external view returns (uint256);

  function riskFreeValueReceiver() external view returns (address);

  function setAutoRebase(bool _autoRebase) external;

  function setAutomatedMarketMakerPair(address _pair, bool _value) external;

  function setFeeReceivers(
    address _liquidityReceiver,
    address _treasuryReceiver,
    address _riskFreeValueReceiver,
    address _galaxyBondReceiver,
    address _sphereSwapper
  ) external;

  function setFeeTypeExempt(
    address _addr,
    bool _value,
    uint256 _type
  ) external;

  function setFeesOnNormalTransfers(bool _enabled) external;

  function setGoDeflationary(bool _goDeflationary) external;

  function setInitialDistributionFinished(bool _value) external;

  function setInvestRemovalDelay(uint256 _value) external;

  function setIsLiquidityEnabled(bool _value) external;

  function setMaxInvestRemovablePerPeriod(uint256 _value) external;

  function setMaxTransactionAmount(uint256 _maxSellTxn, uint256 _maxBuyTxn)
  external;

  function setMoveBalance(bool _value) external;

  function setNextRebase(uint256 _nextRebase) external;

  function setPartyListDivisor(uint256 _value) external;

  function setPartyTime(bool _value) external;

  function setRebaseFrequency(uint256 _rebaseFrequency) external;

  function setRewardYield(
    uint256 _rewardYield,
    uint256 _rewardYieldDenominator
  ) external;

  function setSellHourlyLimit(bool _value) external;

  function setSphereSettings(address _settings) external;

  function setTaxBracketFeeMultiplier(
    uint256 _taxBracketFeeMultiplier,
    bool _isTaxBracketEnabled
  ) external;

  function setWallDivisor(uint256 _wallDivisor, bool _isWall) external;

  function setWhitelistSetters(
    address _addr,
    bool _value,
    uint256 _type
  ) external;

  function settings() external view returns (address);

  function sphereGamesCheck(address) external view returns (bool);

  function sphereGamesContracts(uint256) external view returns (address);

  function sphereSwapper() external view returns (address);

  function subContractCheck(address) external view returns (bool);

  function subContracts(uint256) external view returns (address);

  function swapEnabled() external view returns (bool);

  function symbol() external view returns (string memory);

  function taxBracketMultiplier() external view returns (uint256);

  function totalSupply() external view returns (uint256);

  function transfer(address to, uint256 value) external returns (bool);

  function transferFrom(
    address from,
    address to,
    uint256 value
  ) external returns (bool);

  function transferOwnership(address newOwner) external;

  function treasuryReceiver() external view returns (address);

  function wallDivisor() external view returns (uint256);
}
