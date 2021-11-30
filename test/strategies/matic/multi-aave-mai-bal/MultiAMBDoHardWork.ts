import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import {ICamToken, IStrategy, SmartVault, StrategyAaveMaiBal} from "../../../../typechain";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {UniswapUtils} from "../../../UniswapUtils";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../../../TokenUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber} from "ethers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class MultiAaveMaiBalTest extends DoHardWorkLoopBase {

  public camToken: string;
  public airDropper: SignerWithAddress;
  public airDropToken: string;
  public airDropAmount: BigNumber;
  public airDropPipeIndex: number;


  constructor(signer: SignerWithAddress, user: SignerWithAddress, core: CoreContractsWrapper, tools: ToolsContractsWrapper, underlying: string, vault: SmartVault, strategy: IStrategy, balanceTolerance: number, finalBalanceTolerance: number, camToken: string, airDropper: SignerWithAddress, airDropToken: string, airDropAmount: BigNumber, airDropPipeIndex: number) {
    super(signer, user, core, tools, underlying, vault, strategy, balanceTolerance, finalBalanceTolerance);
    this.camToken = camToken;
    this.airDropper = airDropper;
    this.airDropToken = airDropToken;
    this.airDropAmount = airDropAmount;
    this.airDropPipeIndex = airDropPipeIndex;
  }

  public async afterBlocAdvance() {
    await super.afterBlocAdvance();

    const strategyAaveMaiBal: StrategyAaveMaiBal = this.strategy as StrategyAaveMaiBal;

    // claim aave rewards on mai
    console.log('claimAaveRewards');
    const cam = await DeployerUtils.connectInterface(this.signer, 'ICamToken', this.camToken) as ICamToken;
    await cam.claimAaveRewards();

    // air drop reward token
    await UniswapUtils.buyToken(this.airDropper, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, this.airDropAmount);
    await UniswapUtils.buyToken(this.airDropper, MaticAddresses.SUSHI_ROUTER, this.airDropToken, this.airDropAmount);
    const bal = await TokenUtils.balanceOf(this.airDropToken, this.airDropper.address);
    const pipeAddress = await strategyAaveMaiBal.pipes(this.airDropPipeIndex);
    await TokenUtils.transfer(this.airDropToken, this.airDropper, pipeAddress, bal.toString());

  }

}
