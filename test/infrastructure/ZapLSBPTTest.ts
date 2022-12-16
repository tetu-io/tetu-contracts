import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {BigNumber} from "ethers";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {ToolsAddresses} from "../../scripts/models/ToolsAddresses";
import {Controller, MultiSwap, SmartVault, ZapLSBPT} from "../../typechain";
import {parseUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Zap liquid staking Balancer test", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreAddresses;
  let tools: ToolsAddresses;
  let zapLsBpt: ZapLSBPT;
  let multiswap: MultiSwap;
  let controller: Controller;
  let vault: SmartVault;

  // TETU_ETH-BAL_tetuBAL_BPT_V3
  const vaultAddress = '0xBD06685a0e7eBd7c92fc84274b297791F3997ed3';

  before(async function () {
    signer = await DeployerUtils.impersonate();
    snapshot = await TimeUtils.snapshot();

    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    core = await DeployerUtils.getCoreAddresses();
    tools = await DeployerUtils.getToolsAddresses();

    zapLsBpt = await DeployerUtils.deployContract(signer, "ZapLSBPT", core.controller, tools.multiSwap) as ZapLSBPT;
    multiswap = await DeployerUtils.connectContract(signer, 'MultiSwap', tools.multiSwap) as MultiSwap;
    controller = await DeployerUtils.connectContract(signer, 'Controller', core.controller) as Controller;
    vault = await DeployerUtils.connectInterface(signer, 'SmartVault', vaultAddress) as SmartVault;

    await controller.changeWhiteListStatus([zapLsBpt.address], true);
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

  it("Zap in/out USDC", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    const tokenIn = MaticAddresses.USDC_TOKEN;
    const amount = parseUnits('5', 6);

    await TokenUtils.getToken(tokenIn, signer.address, amount);

    await TokenUtils.approve(tokenIn, signer, zapLsBpt.address, amount.toString())

    // const asset0Route = await multiswap.findLpsForSwaps(tokenIn, MaticAddresses.WETH_TOKEN);
    // const asset1Route = await multiswap.findLpsForSwaps(tokenIn, MaticAddresses.BAL_TOKEN);
    // long wait because forking maybe

    const asset0Route = [MaticAddresses.QUICK_USDC_WETH];
    const asset1Route = [MaticAddresses.QUICK_USDC_WETH, '0xc67136e235785727a0d3B5Cfd08325327b81d373'];

    await zapLsBpt.zapInto(
      vaultAddress,
      tokenIn,
      MaticAddresses.WETH_TOKEN,
      asset0Route,
      MaticAddresses.BAL_TOKEN,
      asset1Route,
      amount,
      BigNumber.from(10)
    );

    const vaultBalance = await vault.balanceOf(signer.address);
    expect(vaultBalance).to.be.gt(0)
    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.eq(0)

    await TokenUtils.approve(vault.address, signer, zapLsBpt.address, vaultBalance.toString())
    await zapLsBpt.zapOut(
      vaultAddress,
      tokenIn,
      MaticAddresses.WETH_TOKEN,
      asset0Route.reverse(),
      MaticAddresses.BAL_TOKEN,
      asset1Route.reverse(),
      vaultBalance,
      BigNumber.from(10)
    );

    expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.be.gt(amount.mul(95).div(100))
  });
})