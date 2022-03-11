import {DeployerUtils} from "../../DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  AaveAmPipe,
  AaveAmPipe__factory,
  BalVaultPipe,
  BalVaultPipe__factory,
  MaiCamPipe,
  MaiCamPipe__factory,
  MaiStablecoinPipe,
  MaiStablecoinPipe__factory
} from "../../../../typechain";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {RunHelper} from "../../../utils/tools/RunHelper";

export class AMBPipeDeployer {


  public static async deployAaveAmPipe(
    signer: SignerWithAddress,
    underlying: string,
    amToken: string,
  ): Promise<AaveAmPipe> {
    console.log('deployAaveAmPipe')
    const pipe = await DeployerUtils.deployTetuProxyControlled(signer, 'AaveAmPipe');
    const p = AaveAmPipe__factory.connect(pipe[0].address, signer);
    await RunHelper.runAndWait(() => p.initialize(
      {
        pool: MaticAddresses.AAVE_LENDING_POOL,
        sourceToken: underlying,
        lpToken: amToken,
        rewardToken: MaticAddresses.WMATIC_TOKEN
      },
      {gasLimit: 12_000_000}
    ));
    return p;
  }

  public static async deployMaiCamPipe(
    signer: SignerWithAddress,
    amToken: string,
    camToken: string,
  ): Promise<MaiCamPipe> {
    console.log('deployMaiCamPipe')
    const pipe = await DeployerUtils.deployTetuProxyControlled(signer, 'MaiCamPipe');
    const p = MaiCamPipe__factory.connect(pipe[0].address, signer);
    await RunHelper.runAndWait(() => p.initialize(
      {
        sourceToken: amToken,
        lpToken: camToken,
        rewardToken: MaticAddresses.QI_TOKEN
      },
      {gasLimit: 12_000_000}
    ));
    return p;
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
    collateralNumerator: string,
  ): Promise<MaiStablecoinPipe> {
    console.log('deployMaiStablecoinPipe')
    const pipe = await DeployerUtils.deployTetuProxyControlled(signer, 'MaiStablecoinPipe');
    const p = MaiStablecoinPipe__factory.connect(pipe[0].address, signer);
    await RunHelper.runAndWait(() => p.initialize(
      {
        sourceToken: camToken,
        stablecoin,
        borrowToken: MaticAddresses.miMATIC_TOKEN,
        targetPercentage,
        maxImbalance: '100', // max targetPercentage deviation (+/-) to call rebalance
        rewardToken: MaticAddresses.QI_TOKEN,
        collateralNumerator,
      },
      {gasLimit: 12_000_000}
    ));
    return p;
  }

  public static async deployBalVaultPipe(
    signer: SignerWithAddress,
  ): Promise<BalVaultPipe> {
    console.log('deployBalVaultPipe')
    const pipe = await DeployerUtils.deployTetuProxyControlled(signer, 'BalVaultPipe');
    const p = BalVaultPipe__factory.connect(pipe[0].address, signer);
    await RunHelper.runAndWait(() => p.initialize(
      {
        sourceToken: MaticAddresses.miMATIC_TOKEN,
        vault: MaticAddresses.BALANCER_VAULT,
        poolID: MaticAddresses.BALANCER_POOL_MAI_STABLE_ID,
        tokenIndex: '2', // tokenIndex
        lpToken: MaticAddresses.BALANCER_STABLE_POOL, // Balancer Polygon Stable Pool (BPSP)
        rewardToken: MaticAddresses.BAL_TOKEN,
      },
      {gasLimit: 12_000_000}
    ));
    return p;
  }

}
