import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import {
  ICamToken,
  IErc20Stablecoin,
  IStrategy,
  PriceSource,
  SmartVault,
  StrategyAaveMaiBal
} from "../../../../typechain";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../../../TokenUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {BigNumber} from "ethers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {AMBUtils} from "./AMBUtils";
import {ethers} from "hardhat";

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

  protected async init() {
    await super.init();
    await AMBUtils.refuelMAI(this.signer, this.strategy.address);
  }

  public async afterBlockAdvance() {
    await super.afterBlockAdvance();

    const strategyAaveMaiBal: StrategyAaveMaiBal = this.strategy as StrategyAaveMaiBal;

    // claim aave rewards on mai
    // doesn't work after wmatic rewards stopped
    // console.log('claimAaveRewards');
    // const cam = await DeployerUtils.connectInterface(this.signer, 'ICamToken', this.camToken) as ICamToken;
    // await cam.claimAaveRewards();

    // air drop reward token
    const pipeAddress = await strategyAaveMaiBal.pipes(this.airDropPipeIndex);
    await TokenUtils.getToken(this.airDropToken, pipeAddress, this.airDropAmount);

    // *** mock price ***

    const {stablecoinAddress, priceSlotIndex,} = AMBUtils.getSlotsInfo(this.underlying);
    const stablecoin = (await ethers.getContractAt('IErc20Stablecoin', stablecoinAddress)) as IErc20Stablecoin;

    const priceSourceAddress = await stablecoin.ethPriceSource()
    const priceSource = (await ethers.getContractAt('PriceSource', priceSourceAddress)) as PriceSource;
    const [, priceSourcePrice, ,] = await priceSource.latestRoundData()

    const mockPriceSource = await DeployerUtils.deployContract(
        this.signer, 'MockPriceSource', 0);
    const mockPricePercents = 75; // % from original price
    const mockPrice = priceSourcePrice.mul(mockPricePercents).div(100)
    await mockPriceSource.setPrice(mockPrice);
    // const [, mockSourcePrice, ,] = await mockPriceSource.latestRoundData();
    const ethPriceSourceSlotIndex = priceSlotIndex;
    // set matic price source to our mock contract
    // convert address string to bytes32 string
    const adrBytes32 = '0x' + '0'.repeat(24) + mockPriceSource.address.slice(2)
    await DeployerUtils.setStorageAt(stablecoin.address, ethPriceSourceSlotIndex, adrBytes32);

    // rebalance strategy
    const strategyGov = strategyAaveMaiBal.connect(this.signer);
    await strategyGov.rebalanceAllPipes()


  }

}
