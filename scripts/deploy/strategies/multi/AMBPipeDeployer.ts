import { DeployerUtils } from "../../DeployerUtils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  AaveAmPipe,
  BalVaultPipe,
  MaiCamPipe,
  MaiStablecoinPipe,
} from "../../../../typechain";
import { MaticAddresses } from "../../../addresses/MaticAddresses";

export class AMBPipeDeployer {
  public static async deployAaveAmPipe(
    signer: SignerWithAddress,
    underlying: string,
    amToken: string
  ): Promise<[AaveAmPipe, string[]]> {
    const args: string[] = [
      MaticAddresses.AAVE_LENDING_POOL,
      underlying,
      amToken,
      MaticAddresses.WMATIC_TOKEN,
    ];
    return [
      (await DeployerUtils.deployContract(
        signer,
        "AaveAmPipe",
        args
      )) as AaveAmPipe,
      args,
    ];
  }

  public static async deployMaiCamPipe(
    signer: SignerWithAddress,
    amToken: string,
    camToken: string
  ): Promise<[MaiCamPipe, string[]]> {
    const args: string[] = [amToken, camToken, MaticAddresses.QI_TOKEN];
    return [
      (await DeployerUtils.deployContract(
        signer,
        "MaiCamPipe",
        args
      )) as MaiCamPipe,
      args,
    ];
  }

  // targetPercentage: default is 200
  // https://docs.mai.finance/borrowing-incentives
  // 135% - liquidation (110% - camDAI), 135+25=160 - minimum for incentives
  // 135+270=405 max percentage for incentives
  public static async deployMaiStablecoinPipe(
    signer: SignerWithAddress,
    camToken: string,
    stablecoin: string,
    amToken: string,
    targetPercentage: string,
    collateralNumerator: string
  ): Promise<[MaiStablecoinPipe, string[]]> {
    const args: string[] = [
      camToken,
      stablecoin,
      MaticAddresses.miMATIC_TOKEN,
      targetPercentage,
      "100", // max targetPercentage deviation (+/-) to call rebalance
      MaticAddresses.QI_TOKEN,
      collateralNumerator,
    ];
    return [
      (await DeployerUtils.deployContract(
        signer,
        "MaiStablecoinPipe",
        args
      )) as MaiStablecoinPipe,
      args,
    ];
  }

  public static async deployBalVaultPipe(
    signer: SignerWithAddress
  ): Promise<[BalVaultPipe, string[]]> {
    const args: string[] = [
      MaticAddresses.miMATIC_TOKEN,
      MaticAddresses.BALANCER_VAULT,
      MaticAddresses.BALANCER_POOL_MAI_STABLE_ID,
      "2", // tokenIndex
      MaticAddresses.BALANCER_STABLE_POOL, // Balancer Polygon Stable Pool (BPSP)
      MaticAddresses.BAL_TOKEN,
    ];
    return [
      (await DeployerUtils.deployContract(
        signer,
        "BalVaultPipe",
        args
      )) as BalVaultPipe,
      args,
    ];
  }
}
