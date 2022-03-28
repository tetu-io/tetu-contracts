import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {TradeBot} from "../../typechain";
import {utils} from "ethers";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {Misc} from "../../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

const TOKEN_IN = MaticAddresses.USDC_TOKEN;
const TOKEN_OUT = MaticAddresses.TETU_TOKEN;
const ROUTER = MaticAddresses.TETU_SWAP_ROUTER;

// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
    .env('TETU')
    .options({
      hardhatChainId: {
        type: "number",
        default: 137
      },
    }).argv;

describe("TradeBotTest", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let owner: SignerWithAddress;
  let executor: SignerWithAddress;
  let bot: TradeBot;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    owner = (await ethers.getSigners())[0];
    executor = (await ethers.getSigners())[1];

    bot = await DeployerUtils.deployContract(owner, 'TradeBot') as TradeBot;
  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  beforeEach(async function () {
    snapshotForEach = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshotForEach);
  });


  it("position test", async () => {
    if (argv.hardhatChainId !== 137) {
      return;
    }
    const tokenInAmount = utils.parseUnits('100000', 6);
    await TokenUtils.getToken(TOKEN_IN, owner.address, tokenInAmount)
    await TokenUtils.approve(TOKEN_IN, owner, bot.address, tokenInAmount.toString())
    await bot.open(
      executor.address,
      TOKEN_IN,
      tokenInAmount,
      TOKEN_OUT,
      ROUTER
    );

    expect(await TokenUtils.balanceOf(TOKEN_IN, owner.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_IN, bot.address)).is.eq(tokenInAmount);

    let pos = await bot.positions(owner.address);
    expect(pos.owner.toLowerCase()).is.eq(owner.address.toLowerCase());
    expect(pos.executor.toLowerCase()).is.eq(executor.address.toLowerCase());
    expect(pos.tokenIn.toLowerCase()).is.eq(TOKEN_IN.toLowerCase());
    expect(pos.tokenInAmount).is.eq(tokenInAmount);
    expect(pos.tokenOut.toLowerCase()).is.eq(TOKEN_OUT.toLowerCase());
    expect(pos.tokenOutAmount).is.eq(0);
    expect(pos.router.toLowerCase()).is.eq(ROUTER.toLowerCase());

    await bot.close();

    expect(await TokenUtils.balanceOf(TOKEN_IN, owner.address)).is.eq(tokenInAmount);
    expect(await TokenUtils.balanceOf(TOKEN_IN, bot.address)).is.eq(0);

    pos = await bot.positions(owner.address);
    expect(pos.owner.toLowerCase()).is.eq(Misc.ZERO_ADDRESS);
    expect(pos.executor.toLowerCase()).is.eq(Misc.ZERO_ADDRESS);
    expect(pos.tokenIn.toLowerCase()).is.eq(Misc.ZERO_ADDRESS);
    expect(pos.tokenInAmount).is.eq(0);
    expect(pos.tokenOut.toLowerCase()).is.eq(Misc.ZERO_ADDRESS);
    expect(pos.tokenOutAmount).is.eq(0);
    expect(pos.router.toLowerCase()).is.eq(Misc.ZERO_ADDRESS);
  });

  it("execute test", async () => {
    if (argv.hardhatChainId !== 137) {
      return;
    }
    const tokenInAmount = utils.parseUnits('100000', 6);
    await TokenUtils.getToken(TOKEN_IN, owner.address, tokenInAmount)
    await TokenUtils.approve(TOKEN_IN, owner, bot.address, tokenInAmount.toString())
    await bot.open(
      executor.address,
      TOKEN_IN,
      tokenInAmount,
      TOKEN_OUT,
      ROUTER
    );

    await bot.connect(executor).execute(owner.address, tokenInAmount)

    expect(await TokenUtils.balanceOf(TOKEN_IN, owner.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_IN, bot.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_OUT, bot.address)).is.not.eq(0);

    await bot.close();
    expect(await TokenUtils.balanceOf(TOKEN_IN, owner.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_OUT, bot.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_OUT, owner.address)).is.not.eq(0);
  });

  it("partially execute test", async () => {
    if (argv.hardhatChainId !== 137) {
      return;
    }
    const tokenInAmount = utils.parseUnits('100000', 6);
    await TokenUtils.getToken(TOKEN_IN, owner.address, tokenInAmount)
    await TokenUtils.approve(TOKEN_IN, owner, bot.address, tokenInAmount.toString())
    await bot.open(
      executor.address,
      TOKEN_IN,
      tokenInAmount,
      TOKEN_OUT,
      ROUTER
    );

    await bot.connect(executor).execute(owner.address, tokenInAmount.div(2))

    expect(await TokenUtils.balanceOf(TOKEN_IN, bot.address)).is.eq(tokenInAmount.div(2));
    expect(await TokenUtils.balanceOf(TOKEN_OUT, bot.address)).is.not.eq(0);

    await bot.close();
    expect(await TokenUtils.balanceOf(TOKEN_IN, bot.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_IN, owner.address)).is.eq(tokenInAmount.div(2));
    expect(await TokenUtils.balanceOf(TOKEN_OUT, bot.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_OUT, owner.address)).is.not.eq(0);
  });

});
