import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import {config as dotEnvConfig} from "dotenv";
import {TimeUtils} from "../../../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {VaultUtils} from "../../../VaultUtils";
import {UniswapUtils} from "../../../UniswapUtils";
import {TokenUtils} from "../../../TokenUtils";
import {BigNumber, utils} from "ethers";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreContractsWrapper} from "../../../CoreContractsWrapper";
import {ToolsContractsWrapper} from "../../../ToolsContractsWrapper";
import {
  AaveWethPipe,
  ICamToken,
  IErc20Stablecoin,
  IStrategy,
  PriceSource,
  SmartVault,
  StrategyAaveMaiBal,
  UnwrappingPipe
} from "../../../../typechain";
import {MultiAaveMaiBalTest} from "./MultiAMBDoHardWork";
import {TestAsserts} from "../../../TestAsserts";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    disableStrategyTests: {
      type: "boolean",
      default: false,
    },
    onlyOneMultiAMBStrategyTest: {
      type: "number",
      default: -1,
    }
  }).argv;

// const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal MultiAaveMaiBal tests', async () => {
  let snapshotBefore: string;
  let snapshot: string;

  if (argv.disableStrategyTests) {
    return;
  }

  let strategyAaveMaiBal: StrategyAaveMaiBal;

  const STRATEGY_PLATFORM_ID = 15;

  // const UNDERLYING = MaticAddresses.WMATIC_TOKEN
  const UNDERLYING = MaticAddresses.AAVE_TOKEN
  // const UNDERLYING = MaticAddresses.DAI_TOKEN
  // const UNDERLYING = MaticAddresses.WETH_TOKEN
  // const UNDERLYING = MaticAddresses.WBTC_TOKEN

  const UNWRAPPING_PIPE_INDEX = 0;
  const AAVE_PIPE_INDEX = 1;
  const MAI_PIPE_INDEX = 3;
  const BAL_PIPE_INDEX = 4;

  let STABLECOIN_ADDRESS: string;
  let PRICE_SLOT_INDEX: string;
  let camToken: string;
  if (UNDERLYING === MaticAddresses.WMATIC_TOKEN) {
    camToken = MaticAddresses.CAMWMATIC_TOKEN;
    STABLECOIN_ADDRESS = '0x88d84a85A87ED12B8f098e8953B322fF789fCD1a'; // camWMATIC MAI Vault (cMVT)
    PRICE_SLOT_INDEX = '0x10'
    /* How to find slot index? go to https://web3playground.io/ , use code below and set contractAddress to MAI_STABLECOIN_ADDRESS
        find ethPriceSource() address at the list, and use its index. !Do not forget to convert decimal index to hexadecimal
        async function main() {
          let contractAddress = '0x578375c3af7d61586c2C3A7BA87d2eEd640EFA40'
          for (let index = 0; index < 40; index++){
          console.log(`[${index}]` +
            await web3.eth.getStorageAt(contractAddress, index))
          }
        }
    */

  } else if (UNDERLYING === MaticAddresses.AAVE_TOKEN) {
    camToken = MaticAddresses.CAMAAVE_TOKEN;
    STABLECOIN_ADDRESS = '0x578375c3af7d61586c2C3A7BA87d2eEd640EFA40'; // camAAVE MAI Vault (camAMVT)

  } else if (UNDERLYING === MaticAddresses.DAI_TOKEN) {
    camToken = MaticAddresses.CAMDAI_TOKEN;
    STABLECOIN_ADDRESS = '0xD2FE44055b5C874feE029119f70336447c8e8827';  // camDAI MAI Vault (camDAIMVT)
    PRICE_SLOT_INDEX = '0x0f' // different from default slot

  } else if (UNDERLYING === MaticAddresses.WETH_TOKEN) {
    camToken = MaticAddresses.CAMWETH_TOKEN;
    STABLECOIN_ADDRESS = '0x11A33631a5B5349AF3F165d2B7901A4d67e561ad'; // camWETH MAI Vault (camWEMVT)

  } else if (UNDERLYING === MaticAddresses.WBTC_TOKEN) {
    camToken = MaticAddresses.CAMWBTC_TOKEN;
    STABLECOIN_ADDRESS = '0x7dDA5e1A389E0C1892CaF55940F5fcE6588a9ae0'; // camWBTC MAI Vault (camWBMVT)
  }

  const USER_WMATIC_AMOUNT = utils.parseUnits('10000')
  const DEPOSIT_AMOUNT = utils.parseUnits('1000') // WMATIC
  const REWARDS_AMOUNT = utils.parseUnits('100')  // WMATIC

  let depositAmount: string;
  let iCamToken: ICamToken;
  let airDropper: SignerWithAddress;

  let signer: SignerWithAddress;
  let user: SignerWithAddress;
  let core: CoreContractsWrapper;
  let tools: ToolsContractsWrapper;
  let vault: SmartVault;
  let strategy: IStrategy;
  let lpForTargetToken: string;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    // const [signer, user] = await ethers.getSigners();
    signer = await DeployerUtils.impersonate();
    user = (await ethers.getSigners())[1];
    airDropper = (await ethers.getSigners())[2];

    // const core = await DeployerUtils.getCoreAddressesWrapper(signer);
    core = await DeployerUtils.deployAllCoreContracts(signer);
    tools = await DeployerUtils.getToolsAddressesWrapper(signer);
    iCamToken = await DeployerUtils.connectInterface(signer, 'ICamToken', camToken) as ICamToken

    const data = await StrategyTestUtils.deploy(
      signer,
      core,
      "WETH",
      async vaultAddress => DeployerUtils.deployContract(
        signer,
        "StrategyAaveMaiBal",
        core.controller.address,
        vaultAddress,
        UNDERLYING
      ) as Promise<StrategyAaveMaiBal>,
      UNDERLYING
    );

    // noinspection DuplicatedCode
    vault = data[0];
    strategy = data[1];
    lpForTargetToken = data[2];

    await StrategyTestUtils.initForwarder(core.feeRewardForwarder);

    console.log('addRewardsXTetu');
    await VaultUtils.addRewardsXTetu(signer, vault, core, 1);

    console.log('changePpfsDecreasePermissions');
    await core.vaultController.changePpfsDecreasePermissions([vault.address], true);

    console.log('buyToken for user')
    await TokenUtils.getToken(MaticAddresses.WMATIC_TOKEN, user.address, USER_WMATIC_AMOUNT);
    await TokenUtils.getToken(UNDERLYING, user.address, DEPOSIT_AMOUNT);
    await TokenUtils.getToken(UNDERLYING, signer.address, DEPOSIT_AMOUNT);
    // console.log('buyToken for airDropper')
    await TokenUtils.getToken(MaticAddresses.WMATIC_TOKEN, airDropper.address, REWARDS_AMOUNT);

    const bal = await TokenUtils.balanceOf(UNDERLYING, user.address);
    console.log("User UNDERLYING balance: ", bal.toString());
    depositAmount = bal.toString();

    strategyAaveMaiBal = (await ethers.getContractAt('StrategyAaveMaiBal', strategy.address)) as StrategyAaveMaiBal;

    console.log('############## Preparations completed ##################');
  });

  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });


  it("do hard work with liq path AAVE WMATIC rewards", async () => {
    console.log('>>>AAVE WMATIC rewards');
    await new MultiAaveMaiBalTest(
      signer,
      user,
      core,
      tools,
      UNDERLYING,
      vault,
      strategy,
      0,
      0,
      iCamToken.address,
      airDropper,
      MaticAddresses.WMATIC_TOKEN,
      REWARDS_AMOUNT,
      AAVE_PIPE_INDEX,
    ).start(BigNumber.from(depositAmount), 3, 30000, true);
  });

  it("do hard work with liq path MAI QI rewards", async () => {
    console.log('>>>MAI QI rewards');
    await new MultiAaveMaiBalTest(
      signer,
      user,
      core,
      tools,
      UNDERLYING,
      vault,
      strategy,
      0,
      0,
      iCamToken.address,
      airDropper,
      MaticAddresses.QI_TOKEN,
      REWARDS_AMOUNT,
      MAI_PIPE_INDEX,
    ).start(BigNumber.from(depositAmount), 3, 30000, true);
  });

  it("do hard work with liq path Balancer BAL rewards", async () => {
    console.log('>>>Balancer BAL rewards');

    const token = MaticAddresses.BAL_TOKEN;
    const largestPool = '0xc67136e235785727a0d3B5Cfd08325327b81d373';
    // [,, largestPool] = await strategyInfo.calculator.getLargestPool(token, []);
    console.log('!largestPool', largestPool);
    await core.feeRewardForwarder.addLargestLps(
      [token],
      [largestPool]
    );
    await new MultiAaveMaiBalTest(
      signer,
      user,
      core,
      tools,
      UNDERLYING,
      vault,
      strategy,
      0,
      0,
      iCamToken.address,
      airDropper,
      MaticAddresses.BAL_TOKEN,
      REWARDS_AMOUNT,
      BAL_PIPE_INDEX,
    ).start(BigNumber.from(depositAmount), 3, 30000, true);
  });

  it("Target percentage", async () => {
    console.log('>>>Target percentage test');
    const strategyGov = strategyAaveMaiBal.connect(signer);

    const targetPercentageInitial = await strategyGov.targetPercentage()
    console.log('>>>targetPercentageInitial', targetPercentageInitial.toString());

    await VaultUtils.deposit(user, vault, BigNumber.from(depositAmount));
    console.log('>>>deposited');
    const bal1 = await strategyGov.getMostUnderlyingBalance()
    console.log('>>>bal1', bal1.toString());

    // increase collateral to debt percentage twice, so debt should be decreased twice
    await strategyGov.setTargetPercentage(targetPercentageInitial.mul(2))
    const targetPercentage2 = await strategyGov.targetPercentage()
    console.log('>>>targetPercentage2', targetPercentage2.toString())

    const bal2 = await strategyGov.getMostUnderlyingBalance()
    console.log('>>>bal2', bal2.toString());

    // return target percentage back, so debt should be increased twice
    await strategyGov.setTargetPercentage(targetPercentageInitial)
    const targetPercentage3 = await strategyGov.targetPercentage()
    console.log('>>>targetPercentage3', targetPercentage3.toString())

    const bal3 = await strategyGov.getMostUnderlyingBalance()
    console.log('>>>bal3', bal3.toString());
    const dec = await TokenUtils.decimals(UNDERLYING);
    TestAsserts.closeTo(bal2, bal1.div(2), 0.005, dec);
    TestAsserts.closeTo(bal3, bal1, 0.005, dec);

  });

  it("Rebalance on matic price change", async () => {
    console.log('>>>Rebalance test');
    const strategyGov = strategyAaveMaiBal.connect(signer);

    const stablecoin = (await ethers.getContractAt('IErc20Stablecoin', STABLECOIN_ADDRESS)) as IErc20Stablecoin;

    await strategyGov.rebalanceAllPipes() // should do nothing - as we have no deposit and collateral yet. Needed for coverage call
    const needed0 = await strategyAaveMaiBal.isRebalanceNeeded();
    console.log('>>>needed0', needed0);

    await VaultUtils.deposit(user, vault, BigNumber.from(depositAmount));
    console.log('>>>deposited');
    const bal0 = await strategyGov.getMostUnderlyingBalance()
    console.log('>>>bal0', bal0.toString())

    await strategyGov.rebalanceAllPipes() // should do nothing - pipe must rebalance at deposit
    const bal1 = await strategyGov.getMostUnderlyingBalance()
    console.log('>>>bal1', bal1.toString())

    // *** mock price *2 ***

    const stablecoinEthPrice = await stablecoin.getEthPriceSource()
    console.log('>>>stablecoinEthPrice ', stablecoinEthPrice.toString())

    const priceSourceAddress = await stablecoin.ethPriceSource()
    const priceSource = (await ethers.getContractAt('PriceSource', priceSourceAddress)) as PriceSource;
    const [, priceSourcePrice, ,] = await priceSource.latestRoundData()
    console.log('>>>priceSourcePrice   ', priceSourcePrice.toString())

    const mockPriceSource = await DeployerUtils.deployContract(
      signer, 'MockPriceSource', 0);
    await mockPriceSource.setPrice(priceSourcePrice.mul(2));
    const [, mockSourcePrice, ,] = await mockPriceSource.latestRoundData();
    console.log('>>>mockSourcePrice    ', mockSourcePrice.toString())

    const ethPriceSourceSlotIndex = PRICE_SLOT_INDEX;
    console.log('>>>ethPriceSourceSlotIndex', ethPriceSourceSlotIndex);
    const adrOriginal = await DeployerUtils.getStorageAt(stablecoin.address, ethPriceSourceSlotIndex)
    console.log('>>>adrOriginal        ', adrOriginal)
    // set matic price source to our mock contract
    // convert address string to bytes32 string
    const adrBytes32 = '0x' + '0'.repeat(24) + mockPriceSource.address.slice(2)

    console.log('>>>adrBytes32         ', adrBytes32)
    await DeployerUtils.setStorageAt(stablecoin.address, ethPriceSourceSlotIndex, adrBytes32);

    const stablecoinEthPrice2 = await stablecoin.getEthPriceSource()
    console.log('>>>stablecoinEthPrice2', stablecoinEthPrice2.toString())
    const needed1 = await strategyAaveMaiBal.isRebalanceNeeded();
    console.log('>>>needed1', needed1);

    expect(stablecoinEthPrice2).to.be.equal(mockSourcePrice)

    // ***** check balance after matic price changed x2 ***

    await strategyGov.rebalanceAllPipes()
    const bal2 = await strategyGov.getMostUnderlyingBalance()
    console.log('>>>bal2', bal2.toString())
    const needed2 = await strategyAaveMaiBal.isRebalanceNeeded();

    // ***** check balance after matic price changed back ***

    // set matic price source back to original value
    await DeployerUtils.setStorageAt(stablecoin.address, ethPriceSourceSlotIndex, adrOriginal);
    const stablecoinEthPrice3 = await stablecoin.getEthPriceSource();
    console.log('>>>stablecoinEthPrice3', stablecoinEthPrice3.toString());
    const needed3 = await strategyAaveMaiBal.isRebalanceNeeded();
    console.log('>>>needed3', needed3);

    await strategyGov.rebalanceAllPipes()
    const bal3 = await strategyGov.getMostUnderlyingBalance()
    console.log('>>>bal3', bal3.toString())

    expect(bal0).to.be.eq(bal1);
    const dec = await TokenUtils.decimals(UNDERLYING);
    TestAsserts.closeTo(bal2, bal1.mul(2), 0.005, dec);
    TestAsserts.closeTo(bal3, bal1, 0.005, dec);

    expect(needed0).is.eq(false);
    expect(needed1).is.eq(true);
    expect(needed2).is.eq(false);
    expect(needed3).is.eq(true);

  });

  it("Salvage from pipeline", async () => {
    console.log('>>>Salvage from pipeline test');
    const strategyGov = strategyAaveMaiBal.connect(signer);
    const token = MaticAddresses.DAI_TOKEN; // token to test salvage, 18 decimals
    const pipesLength = await strategyGov.pipesLength();
    console.log('>>>pipesLength  ', pipesLength.toString());
    const amountPerPipe = utils.parseUnits('1')
    console.log('>>>amountPerPipe', amountPerPipe.toString());
    const totalAmount = amountPerPipe.mul(pipesLength)
    console.log('>>>totalAmount  ', totalAmount.toString());
    await UniswapUtils.buyToken(airDropper, MaticAddresses.SUSHI_ROUTER,
      token, totalAmount);

    const balanceAfterBuy = await TokenUtils.balanceOf(token, airDropper.address)
    console.log('>>>balanceAfterBuy', balanceAfterBuy.toString());

    for (let i = 0; i < pipesLength.toNumber(); i++) {
      const pipe = await strategyGov.pipes(i);
      await TokenUtils.transfer(token, airDropper, pipe, amountPerPipe.toString());
    }

    const balanceBefore = await TokenUtils.balanceOf(token, airDropper.address)
    console.log('>>>balanceBefore', balanceBefore);

    await strategyGov.salvageFromPipeline(airDropper.address, token);

    const balanceAfter = await TokenUtils.balanceOf(token, airDropper.address)
    console.log('>>>balanceAfter ', balanceAfter);

    const increase = balanceAfter.sub(balanceBefore)
    console.log('>>>increase     ', increase);

    expect(increase).to.be.equal(totalAmount);

  });

  it("PumpIn on hardwork", async () => {
    console.log('>>>PumpIn on hardwork');
    const strategyGov = strategyAaveMaiBal.connect(signer);
    const amount = utils.parseUnits('10')
    await UniswapUtils.buyToken(airDropper, MaticAddresses.SUSHI_ROUTER,
      UNDERLYING, amount);
    const bal = await TokenUtils.balanceOf(UNDERLYING, airDropper.address)
    console.log('>>>bal   ', bal);
    await TokenUtils.transfer(UNDERLYING, airDropper, strategyGov.address, bal.toString());
    const before = await TokenUtils.balanceOf(UNDERLYING, strategyGov.address)
    console.log('>>>before', before.toString());
    await strategyGov.doHardWork();
    const after = await TokenUtils.balanceOf(UNDERLYING, strategyGov.address)
    console.log('>>>after ', after.toString());

    expect(before).to.be.equal(bal)
    expect(after).to.be.equal(0, 'Underlying token should be pumped in on hard work')
  });


  it("Withdraw and Claim from Pool", async () => {
    console.log('>>>withdrawAndClaimFromPool test');
    const userAddress = user.address
    const before = await TokenUtils.balanceOf(UNDERLYING, userAddress)
    console.log('>>>before      ', before.toString());

    await VaultUtils.deposit(user, vault, BigNumber.from(before));

    const afterDeposit = await TokenUtils.balanceOf(UNDERLYING, userAddress)
    console.log('>>>afterDeposit', afterDeposit.toString());

    await vault.connect(user).exit();

    const afterExit = await TokenUtils.balanceOf(UNDERLYING, userAddress)
    console.log('>>>afterExit   ', afterExit.toString());

    expect(afterDeposit).to.be.equal(0)
    // expect(afterExit).to.be.closeTo(before, before.div(200));
  });

  it("Emergency withdraw from Pool", async () => {
    console.log('>>>emergencyWithdrawFromPool test');
    const userAddress = user.address
    const _depositAmount = await TokenUtils.balanceOf(UNDERLYING, userAddress);
    const before = await strategyAaveMaiBal.getMostUnderlyingBalance()
    console.log('>>>before      ', before.toString());

    await VaultUtils.deposit(user, vault, _depositAmount);

    const afterDeposit = await strategyAaveMaiBal.getMostUnderlyingBalance()
    console.log('>>>afterDeposit', afterDeposit.toString());

    const strategyGov = strategyAaveMaiBal.connect(signer);
    await strategyGov.emergencyExit();

    const afterExit = await strategyAaveMaiBal.getMostUnderlyingBalance()
    console.log('>>>afterExit   ', afterExit.toString());

    expect(before).to.be.equal(0)
    expect(afterDeposit).to.be.above(before);
    expect(afterExit).to.be.equal(0)
  });

  it("Coverage calls", async () => {
    console.log('>>>Coverage calls test');
    const platformId = await strategyAaveMaiBal.platform();
    console.log('>>>platformId', platformId);

    const assets = await strategyAaveMaiBal.assets();
    console.log('>>>assets', assets);

    const poolTotalAmount = await strategyAaveMaiBal.poolTotalAmount()
    console.log('>>>poolTotalAmount', poolTotalAmount);

    const unwrappingPipe = (await ethers.getContractAt('UnwrappingPipe',
      await strategyAaveMaiBal.pipes(UNWRAPPING_PIPE_INDEX))) as UnwrappingPipe;
    const unwrappingPipeOutputBalance = await unwrappingPipe.outputBalance();
    console.log('>>>unwrappingPipe OutputBalance', unwrappingPipeOutputBalance);
    await unwrappingPipe.rebalance(); // for Pipe.sol coverage

    const aaveWethPipe = (await ethers.getContractAt('AaveWethPipe',
      await strategyAaveMaiBal.pipes(AAVE_PIPE_INDEX))) as AaveWethPipe;
    const aaveWethPipeSourceBalance = await aaveWethPipe.sourceBalance();
    console.log('>>>unwrappingPipe SourceBalance', aaveWethPipeSourceBalance);

    const readyToClaim = await strategyAaveMaiBal.readyToClaim()
    console.log('readyToClaim', readyToClaim);

    const availableMai = await strategyAaveMaiBal.availableMai();
    console.log('availableMai', availableMai);

    expect(platformId).is.eq(STRATEGY_PLATFORM_ID);

  });

});
