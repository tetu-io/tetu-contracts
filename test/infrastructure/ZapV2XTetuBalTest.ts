import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {CoreAddresses} from "../../scripts/models/CoreAddresses";
import {Controller, SmartVault__factory, ZapV2XTetuBal} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {getAddress, parseUnits} from "ethers/lib/utils";
import {TokenUtils} from "../TokenUtils";
import {expect} from "chai";
import {OneInchUtils} from "../OneInchUtils";

describe("ZapV2XTetuBal test", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreAddresses;
  let zap: ZapV2XTetuBal
  let controller: Controller;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    snapshot = await TimeUtils.snapshot();

    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    core = await DeployerUtils.getCoreAddresses();
    const tools = await DeployerUtils.getToolsAddresses();
    zap = await DeployerUtils.deployContract(signer, "ZapV2XTetuBal", core.controller) as ZapV2XTetuBal

    controller = await DeployerUtils.connectContract(signer, 'Controller', core.controller) as Controller;
    await controller.changeWhiteListStatus([zap.address], true);
  })

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  beforeEach(async function () {
    snapshotForEach = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshotForEach);
  });

  it("Zap in/out", async () => {
    if (!(await DeployerUtils.isNetwork(137))) {
      console.error('Test only for polygon forking')
      return;
    }

    const testTargets = [
      {
        tokenIn: MaticAddresses.WMATIC_TOKEN,
        amount: parseUnits('3.02031', 18),
      },
      {
        tokenIn: MaticAddresses.BAL_TOKEN,
        amount: parseUnits('3.97030001', 18),
      },
    ]

    for (const a of testTargets) {
      const tokenIn = a.tokenIn;
      const amount = a.amount;

      const tokenInBalanceBefore = await TokenUtils.balanceOf(tokenIn, signer.address)

      const vault = SmartVault__factory.connect(MaticAddresses.XTETUBAL, signer)
      const underlying = await vault.underlying()
      const weth = getAddress(MaticAddresses.WETH_TOKEN);
      const bal = getAddress(MaticAddresses.BAL_TOKEN);
      const amountsOfTokenIn = [];
      const amountsOfAssetsIn = [];
      const swapQuoteAsset = [];

      let swapQuoteResult;
      amountsOfTokenIn[0] = amount.mul(2).div(10).toString()
      if (tokenIn !== weth.toLowerCase()) {
        swapQuoteResult = await OneInchUtils.swapQuote(tokenIn, weth, amount.mul(2).div(10).toString(), zap.address);
        swapQuoteAsset[0] = swapQuoteResult.tx.data
        amountsOfAssetsIn[0] = swapQuoteResult.toTokenAmount
      } else {
        swapQuoteAsset[0] = "0x00"
        amountsOfAssetsIn[0] = amount.mul(2).div(10).toString()
      }

      amountsOfTokenIn[1] = amount.mul(8).div(10).toString()
      if (tokenIn !== bal.toLowerCase()) {
        swapQuoteResult = await OneInchUtils.swapQuote(tokenIn, bal, amountsOfTokenIn[1], zap.address);
        swapQuoteAsset[1] = swapQuoteResult.tx.data
        amountsOfAssetsIn[1] = swapQuoteResult.toTokenAmount
      } else {
        swapQuoteAsset[1] = "0x00"
        amountsOfAssetsIn[1] = amountsOfTokenIn[1]
      }

      const quoteInShared = await zap.callStatic.quoteInto(amountsOfAssetsIn[0], amountsOfAssetsIn[1])
      await TokenUtils.getToken(tokenIn, signer.address, amount);
      await TokenUtils.approve(tokenIn, signer, zap.address, amount.toString())

      await zap.zapInto(
        tokenIn,
        swapQuoteAsset[0],
        swapQuoteAsset[1],
        amount
      )

      const vaultBalance = await vault.balanceOf(signer.address);
      expect(vaultBalance).to.be.gt(quoteInShared.sub(quoteInShared.div(100))) // 1% slippage

      // contract balance must be empty
      expect(await TokenUtils.balanceOf(tokenIn, zap.address)).to.eq(0)
      expect(await TokenUtils.balanceOf(underlying, zap.address)).to.eq(0)
      expect(await TokenUtils.balanceOf(weth, zap.address)).to.eq(0)
      expect(await TokenUtils.balanceOf(bal, zap.address)).to.eq(0)
      expect(await TokenUtils.balanceOf(MaticAddresses.BALANCER_BAL_ETH_POOL, zap.address)).to.eq(0)

      const amountsOut = await zap.callStatic.quoteOut(vaultBalance)
      if (tokenIn !== weth.toLowerCase()) {
        swapQuoteAsset[0] = (await OneInchUtils.swapQuote(weth, tokenIn, amountsOut[0].toString(), zap.address)).tx.data
      } else {
        swapQuoteAsset[0] = '0x00'
      }

      if (tokenIn !== bal.toLowerCase()) {
        swapQuoteAsset[1] = (await OneInchUtils.swapQuote(bal, tokenIn, amountsOut[1].toString(), zap.address)).tx.data
      } else {
        swapQuoteAsset[1] = '0x00'
      }

      await TokenUtils.approve(vault.address, signer, zap.address, vaultBalance.toString())
      await zap.zapOut(tokenIn, swapQuoteAsset[0], swapQuoteAsset[1], vaultBalance)
      expect(await TokenUtils.balanceOf(tokenIn, signer.address)).to.be.gt(tokenInBalanceBefore.add(amount.mul(98).div(100)))

      // contract balance must be empty
      expect(await TokenUtils.balanceOf(tokenIn, zap.address)).to.eq(0)
      expect(await TokenUtils.balanceOf(underlying, zap.address)).to.eq(0)
      expect(await TokenUtils.balanceOf(weth, zap.address)).to.eq(0)
      expect(await TokenUtils.balanceOf(bal, zap.address)).to.eq(0)
      expect(await TokenUtils.balanceOf(MaticAddresses.BALANCER_BAL_ETH_POOL, zap.address)).to.eq(0)
    }
  })
})
