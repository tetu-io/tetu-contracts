import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper, Controller, IStrategy, PriceCalculator} from "../../../typechain";
import {utils} from "ethers";
import {TokenUtils} from "../../../test/TokenUtils";
import {RunHelper} from "../tools/RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];
  // const signer = await DeployerUtils.impersonate('0xbbbbb8C4364eC2ce52c59D2Ed3E56F307E529a94');

  const controller = await DeployerUtils.connectProxy(core.controller, signer, "Controller") as Controller;
  const bookkeeper = await DeployerUtils.connectProxy(core.bookkeeper, signer, "Bookkeeper") as Bookkeeper;
  const calculator = await DeployerUtils.connectProxy(tools.calculator, signer, "PriceCalculator") as PriceCalculator;
  const ps = await DeployerUtils.connectVault(core.psVault, signer);

  const vaults = await bookkeeper.vaults();

  // noinspection InfiniteLoopJS
  while (true) {
    // tslint:disable-next-line:prefer-for-of
    for (let i = 0; i < vaults.length; i++) {
      const vault = vaults[i];
      const vaultContract = await DeployerUtils.connectVault(vault, signer);
      const strategy = await vaultContract.strategy();
      const stratContr = await DeployerUtils.connectInterface(signer, 'IStrategy', strategy) as IStrategy;
      const platform = await stratContr.platform();
      const vaultName = await vaultContract.name();
      const undDec = await vaultContract.decimals();

      // const platform = await
      if (!(await vaultContract.active()) || platform <= 1) {
        continue;
      }
      const readyToClaim = await stratContr.readyToClaim();
      const rts = await stratContr.rewardTokens();

      let toClaimUsd = 0;

      for (let j = 0; j < rts.length; j++) {
        const rtDec = await TokenUtils.decimals(rts[j]);
        const toClaim = readyToClaim[j];

        const rtPrice = await calculator.getPriceWithDefaultOutput(rts[j]);

        toClaimUsd += +utils.formatUnits(toClaim.mul(rtPrice), rtDec + 18);
      }

      if (platform <= 1
        // || toClaimUsd <= 10
      ) {
        console.log('no rewards', vaultName, platform, toClaimUsd);
        continue;
      }

      const psPpfs = +utils.formatUnits(await ps.getPricePerFullShare());
      const ppfs = +utils.formatUnits(await vaultContract.getPricePerFullShare(), undDec);
      const iTokenBal = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken, vault));

      console.log(i, 'DoHardWork for', await vaultContract.name(), iTokenBal);
      // console.log('ps share price', psPpfs);
      console.log('toClaimUsd', toClaimUsd);

      await RunHelper.runAndWait(() => controller.doHardWork(vault));

      const psPpfsAfter = +utils.formatUnits(await ps.getPricePerFullShare());
      const ppfsAfter = +utils.formatUnits(await vaultContract.getPricePerFullShare(), undDec);
      const iTokenBalAfter = +utils.formatUnits(await TokenUtils.balanceOf(core.rewardToken, vault));

      console.log('reward change', iTokenBalAfter - iTokenBal);
      console.log('PPFS change', ppfsAfter - ppfs, ppfs, ppfsAfter);
      console.log('PS ppfs change', psPpfsAfter - psPpfs);
      console.log('---------------------------------------');
    }

    await DeployerUtils.delay(100000 + (Math.random() * 100000));
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
