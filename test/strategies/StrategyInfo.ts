import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {IStrategy, PriceCalculator, SmartVault} from "../../typechain";

export class StrategyInfo {
  public readonly underlying: string;
  public readonly signer: SignerWithAddress;
  public readonly user: SignerWithAddress;
  public readonly core: CoreContractsWrapper;
  public readonly vault: SmartVault;
  public readonly strategy: IStrategy;
  public readonly lpForTargetToken: string;
  public readonly calculator: PriceCalculator;


  constructor(
      underlying: string,
      signer: SignerWithAddress,
      user: SignerWithAddress,
      core: CoreContractsWrapper,
      vault: SmartVault,
      strategy: IStrategy,
      lpForTargetToken: string,
      calculator: PriceCalculator
  ) {
    this.underlying = underlying;
    this.signer = signer;
    this.user = user;
    this.core = core;
    this.vault = vault;
    this.strategy = strategy;
    this.lpForTargetToken = lpForTargetToken;
    this.calculator = calculator;
  }
}
