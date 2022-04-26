import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import {
  IErc20Stablecoin,
  IStrategy,
  IPriceSourceAll,
  SmartVault,
  StrategyMaiBal
} from "../../../../typechain";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {TokenUtils} from "../../../TokenUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber} from "ethers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {MBUtils} from "./MBUtils";
import {ethers} from "hardhat";

chai.use(chaiAsPromised);

export class MultiMaiBalTest extends DoHardWorkLoopBase {

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

  protected async init() {
    await super.init();
    await MBUtils.refuelMAI(this.signer, this.strategy.address);
  }

  public async afterBlockAdvance() {
    await super.afterBlockAdvance();

    const strategyMaiBal: StrategyMaiBal = this.strategy as StrategyMaiBal;

    // air drop reward token
    const pipeAddress = await strategyMaiBal.pipes(this.airDropPipeIndex);
    await TokenUtils.getToken(this.airDropToken, pipeAddress, this.airDropAmount);

    // *** mock price ***

    const {stablecoinAddress, priceSlotIndex,} = MBUtils.getSlotsInfo(this.underlying);
    const stablecoin = (await ethers.getContractAt('IErc20Stablecoin', stablecoinAddress)) as IErc20Stablecoin;

    const priceSourceAddress = await stablecoin.ethPriceSource()
    const priceSource = (await ethers.getContractAt('IPriceSourceAll', priceSourceAddress)) as IPriceSourceAll;
    const priceSourcePrice = await priceSource.latestAnswer()

    const mockPriceSource = await DeployerUtils.deployContract(
        this.signer, 'MockPriceSourceAll', 0);
    const mockPricePercents = 75; // % from original price
    const mockPrice = priceSourcePrice.mul(mockPricePercents).div(100)
    console.log('>>>mockPrice', mockPrice);
    await mockPriceSource.setPrice(mockPrice);
    const mockSourcePrice = await mockPriceSource.latestAnswer();
    console.log('>>>mockSourcePrice', mockSourcePrice);
    // set matic price source to our mock contract
    // convert address string to bytes32 string
    const adrBytes32 = '0x' + '0'.repeat(24) + mockPriceSource.address.slice(2)
    console.log('>>>priceSlotIndex', priceSlotIndex);
    await DeployerUtils.setStorageAt(stablecoin.address, priceSlotIndex, adrBytes32);

    // rebalance strategy
    const strategyGov = strategyMaiBal.connect(this.signer);
    await strategyGov.rebalanceAllPipes()


  }

}
