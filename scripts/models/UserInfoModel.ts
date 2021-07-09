import {BigNumber} from "ethers";

export class UserInfoModel {
  wallet: string;
  vault: string;
  balance: BigNumber;
  balanceUsdc: BigNumber;
  rewardTokens: string[];
  rewards: BigNumber[];


  constructor(wallet: string, vault: string, balance: BigNumber,
              balanceUsdc: BigNumber, rewardTokens: string[], rewards: BigNumber[]) {
    this.wallet = wallet;
    this.vault = vault;
    this.balance = balance;
    this.balanceUsdc = balanceUsdc;
    this.rewardTokens = rewardTokens;
    this.rewards = rewards;
  }
}
