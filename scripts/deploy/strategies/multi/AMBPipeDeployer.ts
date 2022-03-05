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

export class AMBPipeDeployer {


  public static async deployAaveAmPipe(
    signer: SignerWithAddress,
    underlying: string,
    amToken: string,
  ): Promise<AaveAmPipe> {
    const pipe = await DeployerUtils.deployTetuProxyControlled(signer, 'AaveAmPipe');
    const p = AaveAmPipe__factory.connect(pipe[0].address, signer);
    await p.initialize(
      {
        pool: MaticAddresses.AAVE_LENDING_POOL,
        sourceToken: underlying,
        lpToken: amToken,
        rewardToken: MaticAddresses.WMATIC_TOKEN
      }
    );
    return p;
  }

  public static async deployMaiCamPipe(
    signer: SignerWithAddress,
    amToken: string,
    camToken: string,
  ): Promise<MaiCamPipe> {
    const pipe = await DeployerUtils.deployTetuProxyControlled(signer, 'MaiCamPipe');
    const p = MaiCamPipe__factory.connect(pipe[0].address, signer);
    await p.initialize(
      {
        sourceToken: amToken,
        lpToken: camToken,
        rewardToken: MaticAddresses.QI_TOKEN
      }
    );
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
    const pipe = await DeployerUtils.deployTetuProxyControlled(signer, 'MaiStablecoinPipe');
    const p = MaiStablecoinPipe__factory.connect(pipe[0].address, signer);
    await p.initialize(
      {
        sourceToken: camToken,
        stablecoin,
        borrowToken: MaticAddresses.miMATIC_TOKEN,
        targetPercentage,
        maxImbalance: '100', // max targetPercentage deviation (+/-) to call rebalance
        rewardToken: MaticAddresses.QI_TOKEN,
        collateralNumerator,
      }
    );
    return p;
  }

  public static async deployBalVaultPipe(
    signer: SignerWithAddress,
  ): Promise<BalVaultPipe> {
    const pipe = await DeployerUtils.deployTetuProxyControlled(signer, 'BalVaultPipe');
    const p = BalVaultPipe__factory.connect(pipe[0].address, signer);
    await p.initialize(
      {
        sourceToken: MaticAddresses.miMATIC_TOKEN,
        vault: MaticAddresses.BALANCER_VAULT,
        poolID: MaticAddresses.BALANCER_POOL_MAI_STABLE_ID,
        tokenIndex: '2', // tokenIndex
        lpToken: MaticAddresses.BALANCER_STABLE_POOL, // Balancer Polygon Stable Pool (BPSP)
        rewardToken: MaticAddresses.BAL_TOKEN,
      }
    );
    return p;
  }

}
