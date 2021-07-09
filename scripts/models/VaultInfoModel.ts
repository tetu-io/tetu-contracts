import {BigNumber} from "ethers";

export class VaultInfoModel {
  addr: string;
  name: string;
  created: BigNumber;
  active: boolean;
  tvl: BigNumber;
  tvlUsdc: BigNumber;
  decimals: BigNumber;
  underlying: string;
  rewardTokens: string[];
  rewardTokensBal: BigNumber[];
  rewardTokensBalUsdc: BigNumber[];
  duration: BigNumber;
  rewardsApr: BigNumber[];
  ppfsApr: BigNumber;
  strategy: string;
  strategyCreated: BigNumber;
  platform: string;
  assets: string[];
  strategyRewards: string[];
  strategyOnPause: boolean;
  earned: BigNumber;


  constructor(addr: string, name: string, created: BigNumber, active: boolean, tvl: BigNumber, tvlUsdc: BigNumber, decimals: BigNumber, underlying: string, rewardTokens: string[], rewardTokensBal: BigNumber[], rewardTokensBalUsdc: BigNumber[], duration: BigNumber, rewardsApr: BigNumber[], ppfsApr: BigNumber, strategy: string, strategyCreated: BigNumber, platform: string, assets: string[], strategyRewards: string[], strategyOnPause: boolean, earned: BigNumber) {
    this.addr = addr;
    this.name = name;
    this.created = created;
    this.active = active;
    this.tvl = tvl;
    this.tvlUsdc = tvlUsdc;
    this.decimals = decimals;
    this.underlying = underlying;
    this.rewardTokens = rewardTokens;
    this.rewardTokensBal = rewardTokensBal;
    this.rewardTokensBalUsdc = rewardTokensBalUsdc;
    this.duration = duration;
    this.rewardsApr = rewardsApr;
    this.ppfsApr = ppfsApr;
    this.strategy = strategy;
    this.strategyCreated = strategyCreated;
    this.platform = platform;
    this.assets = assets;
    this.strategyRewards = strategyRewards;
    this.strategyOnPause = strategyOnPause;
    this.earned = earned;
  }
}
