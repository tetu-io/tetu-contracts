import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {TradeBot1Inch} from "../../typechain";
import {utils} from "ethers";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {Misc} from "../../scripts/utils/tools/Misc";
import {parseUnits} from "ethers/lib/utils";
import fetch from "node-fetch";

const {expect} = chai;
chai.use(chaiAsPromised);

// tslint:disable-next-line:no-var-requires
const hre = require("hardhat");

const TOKEN_IN = MaticAddresses.TETU_TOKEN;
const TOKEN_OUT = MaticAddresses.USDC_TOKEN;

// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
  .env('TETU')
  .options({
    hardhatChainId: {
      type: "number",
      default: 0
    },
  }).argv;

describe("TradeBot 1inch test", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let owner: SignerWithAddress;
  let executor: SignerWithAddress;
  let bot: TradeBot1Inch;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    owner = (await ethers.getSigners())[0];
    executor = (await ethers.getSigners())[1];

    bot = await DeployerUtils.deployContract(owner, 'TradeBot1Inch', '0x1111111254EEB25477B68fb85Ed929f73A960582', owner.address, executor.address) as TradeBot1Inch;
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
    const tokenInAmount = utils.parseUnits('100000', 18);
    await TokenUtils.getToken(TOKEN_IN, owner.address, tokenInAmount)
    await TokenUtils.approve(TOKEN_IN, owner, bot.address, tokenInAmount.toString())
    await bot.open(
      executor.address,
      TOKEN_IN,
      tokenInAmount,
      TOKEN_OUT,
      parseUnits((1 / 0.03).toFixed(18)),
      parseUnits((1 / 0.01).toFixed(18)),
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
  });

  it("execute test", async () => {
    if (argv.hardhatChainId !== 137) {
      return;
    }
    console.log(parseUnits((1 / 0.03).toFixed(18)).toString())
    console.log(parseUnits((1 / 0.01).toFixed(18)).toString())
    const tokenInAmount = utils.parseUnits('100000', 18);
    await TokenUtils.getToken(TOKEN_IN, owner.address, tokenInAmount)
    await TokenUtils.approve(TOKEN_IN, owner, bot.address, tokenInAmount.toString())
    await bot.open(
      executor.address,
      TOKEN_IN,
      tokenInAmount,
      TOKEN_OUT,
      parseUnits((1 / 0.03).toFixed(18)),
      parseUnits((1 / 0.01).toFixed(18)),
    );

    const params = {
      fromTokenAddress: TOKEN_IN,
      toTokenAddress: TOKEN_OUT,
      amount: tokenInAmount.toString(),
      fromAddress: bot.address,
      slippage: 1,
      disableEstimate: true,
      allowPartialFill: false,
      destReceiver: bot.address,
    };

    const swapTransaction = await buildTxForSwap(JSON.stringify(params));

    await bot.connect(executor).execute(owner.address, tokenInAmount, swapTransaction.data)

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
    const tokenInAmount = utils.parseUnits('100000', 18);
    await TokenUtils.getToken(TOKEN_IN, owner.address, tokenInAmount)
    await TokenUtils.approve(TOKEN_IN, owner, bot.address, tokenInAmount.toString())
    await bot.open(
      executor.address,
      TOKEN_IN,
      tokenInAmount,
      TOKEN_OUT,
      parseUnits((1 / 0.03).toFixed(18)),
      parseUnits((1 / 0.01).toFixed(18)),
    );

    const params = {
      fromTokenAddress: TOKEN_IN,
      toTokenAddress: TOKEN_OUT,
      amount: tokenInAmount.div(2).toString(),
      fromAddress: bot.address,
      slippage: 1,
      disableEstimate: true,
      allowPartialFill: false,
      destReceiver: bot.address,
    };

    const swapTransaction = await buildTxForSwap(JSON.stringify(params));

    await bot.connect(executor).execute(owner.address, tokenInAmount.div(2), swapTransaction.data)

    expect(await TokenUtils.balanceOf(TOKEN_IN, bot.address)).is.eq(tokenInAmount.div(2));
    expect(await TokenUtils.balanceOf(TOKEN_OUT, bot.address)).is.not.eq(0);

    await bot.close();
    expect(await TokenUtils.balanceOf(TOKEN_IN, bot.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_IN, owner.address)).is.eq(tokenInAmount.div(2));
    expect(await TokenUtils.balanceOf(TOKEN_OUT, bot.address)).is.eq(0);
    expect(await TokenUtils.balanceOf(TOKEN_OUT, owner.address)).is.not.eq(0);
  });

});

function apiRequestUrl(methodName: string, queryParams: string) {
  const chainId = hre.network.config.chainId;
  console.log('chainId', chainId);
  const apiBaseUrl = 'https://api.1inch.io/v5.0/' + chainId;
  const r = (new URLSearchParams(JSON.parse(queryParams))).toString();
  return apiBaseUrl + methodName + '?' + r;
}

async function buildTxForSwap(params: string) {
  const url = apiRequestUrl('/swap', params);
  console.log('url', url)
  return fetch(url).then(res => {
    // console.log('res', res)
    return res.json();
  }).then(res => res.tx);
}
