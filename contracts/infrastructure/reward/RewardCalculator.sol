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

import "@openzeppelin/contracts/utils/math/Math.sol";
import "../../base/governance/Controllable.sol";
import "../../base/interface/ISmartVault.sol";
import "../../base/interface/IStrategy.sol";
import "../../base/interface/IBookkeeper.sol";
import "../../third_party/wault/IWexPolyMaster.sol";
import "../../third_party/sushi/IMiniChefV2.sol";
import "../../third_party/iron/IIronChef.sol";
import "../../third_party/hermes/IIrisMasterChef.sol";
import "../../third_party/synthetix/SNXRewardInterface.sol";
import "../../base/interface/IMasterChefStrategyCafe.sol";
import "../../base/interface/IMasterChefStrategyV1.sol";
import "../../base/interface/IMasterChefStrategyV2.sol";
import "../../base/interface/IMasterChefStrategyV3.sol";
import "../../base/interface/IIronFoldStrategy.sol";
import "../../base/interface/ISNXStrategy.sol";
import "../../base/interface/IStrategyWithPool.sol";
import "../../third_party/cosmic/ICosmicMasterChef.sol";
import "../../third_party/dino/IFossilFarms.sol";
import "../price/IPriceCalculator.sol";
import "./IRewardCalculator.sol";
import "../../third_party/quick/IDragonLair.sol";
import "../../third_party/quick/IStakingDualRewards.sol";
import "../../third_party/iron/IronControllerInterface.sol";
import "../../third_party/iron/CompleteRToken.sol";

/// @title Calculate estimated strategy rewards
/// @author belbix
contract RewardCalculator is Controllable, IRewardCalculator {

  // ************** CONSTANTS *****************************
  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.0";
  uint256 public constant PRECISION = 1e18;
  uint256 public constant MULTIPLIER_DENOMINATOR = 100;
  uint256 public constant BLOCKS_PER_MINUTE = 2727; // 27.27
  string private constant _CALCULATOR = "calculator";
  address public constant D_QUICK = address(0xf28164A485B0B2C90639E47b0f377b4a438a16B1);

  // ************** VARIABLES *****************************
  // !!!!!!!!! DO NOT CHANGE NAMES OR ORDERING!!!!!!!!!!!!!
  mapping(bytes32 => address) internal tools;
  mapping(IStrategy.Platform => uint256) internal platformMultiplier;

  function initialize(address _controller, address _calculator) external initializer {
    Controllable.initializeControllable(_controller);
    tools[keccak256(abi.encodePacked(_CALCULATOR))] = _calculator;
  }

  // ************* MAIN ***********************************

  function priceCalculator() public view returns (IPriceCalculator) {
    return IPriceCalculator(tools[keccak256(abi.encodePacked(_CALCULATOR))]);
  }

  function getPrice(address _token) public view override returns (uint256) {
    return priceCalculator().getPriceWithDefaultOutput(_token);
  }

  function strategyRewardsUsd(address _strategy, uint256 _period) public view override returns (uint256) {
    IStrategy strategy = IStrategy(_strategy);
    if (strategy.rewardTokens().length == 0) {
      return 0;
    }
    uint256 rtPrice = getPrice(strategy.rewardTokens()[0]);
    uint256 rewardsPerSecond = 0;
    if (
      strategy.platform() == IStrategy.Platform.TETU
      || strategy.platform() == IStrategy.Platform.TETU_SWAP
      || strategy.platform() == IStrategy.Platform.UNKNOWN
    ) {
      return 0;
    } else if (strategy.platform() == IStrategy.Platform.QUICK) {

      if (strategy.rewardTokens().length == 2) {
        rewardsPerSecond = quickDualFarm(IStrategyWithPool(_strategy).pool());
      } else {
        rewardsPerSecond = quick(address(ISNXStrategy(_strategy).rewardPool()));
      }

    } else if (strategy.platform() == IStrategy.Platform.SUSHI) {

      IMasterChefStrategyV3 mc = IMasterChefStrategyV3(_strategy);
      rewardsPerSecond = miniChefSushi(mc.mcRewardPool(), mc.poolID());

    } else if (strategy.platform() == IStrategy.Platform.WAULT) {

      IMasterChefStrategyV2 mc = IMasterChefStrategyV2(_strategy);
      rewardsPerSecond = wault(mc.pool(), mc.poolID());

    } else if (strategy.platform() == IStrategy.Platform.IRON) {

      IMasterChefStrategyV3 mc = IMasterChefStrategyV3(_strategy);
      rewardsPerSecond = ironMc(mc.mcRewardPool(), mc.poolID());

    } else if (strategy.platform() == IStrategy.Platform.COSMIC) {

      IMasterChefStrategyV1 mc = IMasterChefStrategyV1(_strategy);
      rewardsPerSecond = cosmic(mc.masterChefPool(), mc.poolID());

    } else if (strategy.platform() == IStrategy.Platform.CURVE) {
      // todo
      return 0;

    } else if (strategy.platform() == IStrategy.Platform.DINO) {

      IMasterChefStrategyV2 mc = IMasterChefStrategyV2(_strategy);
      rewardsPerSecond = dino(mc.pool(), mc.poolID());

    } else if (strategy.platform() == IStrategy.Platform.IRON_LEND) {
      // we already have usd rate
      rewardsPerSecond = ironLending(strategy);

    } else if (strategy.platform() == IStrategy.Platform.HERMES) {

      IMasterChefStrategyV2 mc = IMasterChefStrategyV2(_strategy);
      rewardsPerSecond = hermes(mc.pool(), mc.poolID());

    } else if (strategy.platform() == IStrategy.Platform.CAFE) {

      IMasterChefStrategyCafe mc = IMasterChefStrategyCafe(_strategy);
      rewardsPerSecond = cafe(address(mc.masterChefPool()), mc.poolID());

    }

    uint256 _kpi = kpi(strategy.vault());
    uint256 multiplier = platformMultiplier[strategy.platform()];

    if (_kpi != 0) {
      rewardsPerSecond = rewardsPerSecond * _kpi / PRECISION;
    }

    if (multiplier != 0) {
      rewardsPerSecond = rewardsPerSecond * multiplier / MULTIPLIER_DENOMINATOR;
    }

    // return precalculated rates
    if (strategy.platform() == IStrategy.Platform.IRON_LEND) {
      return _period * rewardsPerSecond;
    }

    uint256 result = _period * rewardsPerSecond * rtPrice / PRECISION;
    if (strategy.rewardTokens().length == 2) {
      if (strategy.platform() == IStrategy.Platform.SUSHI) {
        IMasterChefStrategyV3 mc = IMasterChefStrategyV3(_strategy);
        uint256 rewardsPerSecond2 = mcRewarder(mc.mcRewardPool(), mc.poolID());
        uint256 rtPrice2 = priceCalculator().getPriceWithDefaultOutput(strategy.rewardTokens()[1]);
        result += _period * rewardsPerSecond2 * rtPrice2 / PRECISION;
      } else if (strategy.platform() == IStrategy.Platform.QUICK) {
        uint256 rtPrice2 = priceCalculator().getPriceWithDefaultOutput(strategy.rewardTokens()[1]);
        result += IStakingDualRewards(IStrategyWithPool(_strategy).pool()).rewardRateB() * rtPrice2 / PRECISION;
      }
    }
    return result;
  }

  /// @dev Return recommended USD amount of rewards for this vault based on TVL ratio
  function rewardsPerTvl(address _vault, uint256 _period) public view override returns (uint256) {
    ISmartVault vault = ISmartVault(_vault);
    uint256 rewardAmount = strategyRewardsUsd(vault.strategy(), _period);
    uint256 ratio = vaultTVLRatio(_vault);
    return rewardAmount * ratio / PRECISION;
  }

  function vaultTVLRatio(address _vault) public view override returns (uint256) {
    ISmartVault vault = ISmartVault(_vault);
    uint256 poolTvl = IStrategy(vault.strategy()).poolTotalAmount();
    if (poolTvl == 0) {
      return 0;
    }
    return vault.underlyingBalanceWithInvestment() * PRECISION / poolTvl;
  }

  function rewardPerBlockToPerSecond(uint256 amount) public pure returns (uint256) {
    return amount * BLOCKS_PER_MINUTE / 6000;
  }

  function mcRewardPerSecond(
    uint256 allocPoint,
    uint256 rewardPerSecond,
    uint256 totalAllocPoint
  ) public pure returns (uint256) {
    return rewardPerSecond * allocPoint / totalAllocPoint;
  }

  function kpi(address _vault) public view override returns (uint256) {
    ISmartVault vault = ISmartVault(_vault);
    if (vault.duration() == 0) {
      return 0;
    }

    uint256 lastRewards = vaultLastReward(_vault);
    if (lastRewards == 0) {
      return 0;
    }

    (uint256 earned, uint256 lastEarnedTs) = strategyEarnedSinceLastDistribution(vault.strategy());

    // lastEarnedTs can not be higher than current block
    uint256 timeSinceDistribution = block.timestamp - lastEarnedTs;

    uint256 reward = Math.min(lastRewards * timeSinceDistribution / vault.duration(), lastRewards);

    return PRECISION * earned / reward;
  }

  function vaultLastReward(address _vault) public view override returns (uint256) {
    IBookkeeper bookkeeper = IBookkeeper(IController(controller()).bookkeeper());
    address rt = IController(controller()).rewardToken();
    uint256 rewardsSize = bookkeeper.vaultRewardsLength(_vault, rt);
    if (rewardsSize > 0) {
      return bookkeeper.vaultRewards(_vault, rt, rewardsSize - 1);
    }
    return 0;
  }

  function strategyEarnedSinceLastDistribution(address strategy)
  public view override returns (uint256 earned, uint256 lastEarnedTs){
    IBookkeeper bookkeeper = IBookkeeper(IController(controller()).bookkeeper());
    uint256 lastEarned = 0;
    lastEarnedTs = 0;

    uint256 earnedSize = bookkeeper.strategyEarnedSnapshotsLength(strategy);
    if (earnedSize > 0) {
      lastEarned = bookkeeper.strategyEarnedSnapshots(strategy, earnedSize - 1);
      lastEarnedTs = bookkeeper.strategyEarnedSnapshotsTime(strategy, earnedSize - 1);
    }

    uint256 currentEarned = bookkeeper.targetTokenEarned(strategy);
    earned = currentEarned;
    if (currentEarned > lastEarned) {
      earned = currentEarned - lastEarned;
    }
  }

  // ************* SPECIFIC TO STRATEGY FUNCTIONS *************

  /// @notice Calculate approximately rewards amounts for Wault Swap
  function wault(address _pool, uint256 _poolID) public view returns (uint256) {
    IWexPolyMaster pool = IWexPolyMaster(_pool);
    (, uint256 allocPoint,,) = pool.poolInfo(_poolID);
    return mcRewardPerSecond(
      allocPoint,
      rewardPerBlockToPerSecond(pool.wexPerBlock()),
      pool.totalAllocPoint()
    );
  }

  /// @notice Calculate approximately rewards amounts for Cosmic Swap
  function cosmic(address _pool, uint256 _poolID) public view returns (uint256) {
    ICosmicMasterChef pool = ICosmicMasterChef(_pool);
    ICosmicMasterChef.PoolInfo memory info = pool.poolInfo(_poolID);
    return mcRewardPerSecond(
      info.allocPoint,
      rewardPerBlockToPerSecond(pool.cosmicPerBlock()),
      pool.totalAllocPoint()
    );
  }

  /// @notice Calculate approximately rewards amounts for Dino Swap
  function dino(address _pool, uint256 _poolID) public view returns (uint256) {
    IFossilFarms pool = IFossilFarms(_pool);
    (, uint256 allocPoint,,) = pool.poolInfo(_poolID);
    return mcRewardPerSecond(
      allocPoint,
      rewardPerBlockToPerSecond(pool.dinoPerBlock()),
      pool.totalAllocPoint()
    );
  }

  /// @notice Calculate approximately rewards amounts for SushiSwap
  function miniChefSushi(address _pool, uint256 _poolID) public view returns (uint256) {
    IMiniChefV2 pool = IMiniChefV2(_pool);
    (,, uint256 allocPoint) = pool.poolInfo(_poolID);
    return mcRewardPerSecond(
      allocPoint,
      pool.sushiPerSecond(),
      pool.totalAllocPoint()
    );
  }

  /// @notice Calculate approximately rewards amounts for Sushi rewarder
  function mcRewarder(address _pool, uint256 _poolID) public view returns (uint256) {
    IMiniChefV2 pool = IMiniChefV2(_pool);
    IRewarder rewarder = pool.rewarder(_poolID);
    (,, uint256 allocPoint) = rewarder.poolInfo(_poolID);
    return mcRewardPerSecond(
      allocPoint,
      rewarder.rewardPerSecond(), // totalAllocPoint is not public so assume that it is the same as MC
      pool.totalAllocPoint()
    );
  }

  /// @notice Calculate approximately reward amounts for Iron MC
  function ironMc(address _pool, uint256 _poolID) public view returns (uint256) {
    IIronChef.PoolInfo memory poolInfo = IIronChef(_pool).poolInfo(_poolID);
    return mcRewardPerSecond(
      poolInfo.allocPoint,
      IIronChef(_pool).rewardPerSecond(),
      IIronChef(_pool).totalAllocPoint()
    );
  }

  /// @notice Calculate approximately reward amounts for HERMES
  function hermes(address _pool, uint256 _poolID) public view returns (uint256) {
    IIrisMasterChef pool = IIrisMasterChef(_pool);
    (, uint256 allocPoint,,,,) = pool.poolInfo(_poolID);
    return mcRewardPerSecond(
      allocPoint,
      rewardPerBlockToPerSecond(pool.irisPerBlock()),
      pool.totalAllocPoint()
    );
  }

  /// @notice Calculate approximately reward amounts for Cafe swap
  function cafe(address _pool, uint256 _poolID) public view returns (uint256) {
    ICafeMasterChef pool = ICafeMasterChef(_pool);
    ICafeMasterChef.PoolInfo memory info = pool.poolInfo(_poolID);
    return mcRewardPerSecond(
      info.allocPoint,
      rewardPerBlockToPerSecond(pool.brewPerBlock()),
      pool.totalAllocPoint()
    );
  }

  /// @notice Calculate approximately reward amounts for Quick swap
  function quick(address _pool) public view returns (uint256) {
    if (SNXRewardInterface(_pool).periodFinish() < block.timestamp) {
      return 0;
    }
    uint256 dQuickRatio = IDragonLair(D_QUICK).QUICKForDQUICK(PRECISION);
    return SNXRewardInterface(_pool).rewardRate() * dQuickRatio / PRECISION;
  }

  /// @notice Calculate approximately reward amounts for Quick swap
  function quickDualFarm(address _pool) public view returns (uint256) {
    if (IStakingDualRewards(_pool).periodFinish() < block.timestamp) {
      return 0;
    }
    uint256 dQuickRatio = IDragonLair(D_QUICK).QUICKForDQUICK(PRECISION);
    return IStakingDualRewards(_pool).rewardRateA() * dQuickRatio / PRECISION;
  }

  function ironLending(IStrategy strategy) public view returns (uint256) {
    address iceToken = strategy.rewardTokens()[0];
    address rToken = IIronFoldStrategy(address(strategy)).rToken();
    address controller = IIronFoldStrategy(address(strategy)).ironController();

    uint icePrice = getPrice(iceToken);
    uint undPrice = getPrice(strategy.underlying());

    uint8 undDecimals = CompleteRToken(strategy.underlying()).decimals();

    uint256 rTokenExchangeRate = CompleteRToken(rToken).exchangeRateStored();

    uint256 totalSupply = CompleteRToken(rToken).totalSupply() * rTokenExchangeRate
    / (10 ** undDecimals);

    uint suppliedRate = CompleteRToken(rToken).supplyRatePerBlock() * undPrice * totalSupply / (PRECISION ** 2);
    // ICE rewards
    uint rewardSpeed = IronControllerInterface(controller).rewardSpeeds(rToken) * icePrice / PRECISION;
    // regarding folding we will earn x2.45
    rewardSpeed = rewardSpeed * 245 / 100;
    return rewardPerBlockToPerSecond(rewardSpeed + suppliedRate);
  }

  // *********** GOVERNANCE ACTIONS *****************

  function setPriceCalculator(address newValue) external onlyControllerOrGovernance {
    tools[keccak256(abi.encodePacked(_CALCULATOR))] = newValue;
    emit ToolAddressUpdated(_CALCULATOR, newValue);
  }

  function setPlatformMultiplier(IStrategy.Platform _platform, uint256 _value) external onlyControllerOrGovernance {
    require(_value < MULTIPLIER_DENOMINATOR * 10, "RC: Too high value");
    platformMultiplier[_platform] = _value;
  }
}
