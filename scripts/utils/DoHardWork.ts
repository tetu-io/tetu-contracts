import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, Controller, IStrategy, PriceCalculator} from "../../typechain";
import {utils} from "ethers";
import {Erc20Utils} from "../../test/Erc20Utils";
import {RunHelper} from "./RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];

  const controller = await DeployerUtils.connectProxy(core.controller, signer, "Controller") as Controller;
  const bookkeeper = await DeployerUtils.connectProxy(core.bookkeeper, signer, "Bookkeeper") as Bookkeeper;
  const calculator = await DeployerUtils.connectProxy(tools.calculator, signer, "PriceCalculator") as PriceCalculator;
  const ps = await DeployerUtils.connectVault(core.psVault, signer);

  const vaults = await bookkeeper.vaults();

  // noinspection InfiniteLoopJS
  while (true) {
    for (let i = vaults.length; i > 0; i--) {
      const vault = vaults[i - 1];
      const vaultContract = await DeployerUtils.connectVault(vault, signer);
      const strategy = await vaultContract.strategy();
      const stratContr = await DeployerUtils.connectInterface(signer, 'IStrategy', strategy) as IStrategy;
      const platform = await stratContr.platform();
      const vaultName = await vaultContract.name();

      // const platform = await
      if (!(await vaultContract.active()) || platform <= 1) {
        continue;
      }
      const readyToClaim = await stratContr.readyToClaim();
      const rts = await stratContr.rewardTokens();

      let toClaimUsd = 0;

      for (let i = 0; i < rts.length; i++) {
        const rtDec = await Erc20Utils.decimals(rts[i]);
        const toClaim = readyToClaim[i];

        const rtPrice = await calculator.getPriceWithDefaultOutput(rts[i]);

        toClaimUsd += +utils.formatUnits(toClaim.mul(rtPrice), rtDec + 18);
      }

      if (platform <= 1
          // || toClaimUsd <= 10
      ) {
        console.log('no rewards', vaultName, platform, toClaimUsd);
        continue;
      }

      const psPpfs = +utils.formatUnits(await ps.getPricePerFullShare());
      const iTokenBal = +utils.formatUnits(await Erc20Utils.balanceOf(core.rewardToken, vault));

      console.log('DoHardWork for', await vaultContract.name(), iTokenBal);
      console.log('ps share price', psPpfs);
      console.log('toClaimUsd', toClaimUsd);

      await RunHelper.runAndWait(() => controller.doHardWork(vault));

      const psPpfsAfter = +utils.formatUnits(await ps.getPricePerFullShare());
      const iTokenBalAfter = +utils.formatUnits(await Erc20Utils.balanceOf(core.rewardToken, vault));

      console.log('reward change', iTokenBalAfter - iTokenBal);
      console.log('PS ppfs change', psPpfsAfter - psPpfs);
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
