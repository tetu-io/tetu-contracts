import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, Controller, IStrategy} from "../../typechain";
import {utils} from "ethers";
import {Erc20Utils} from "../../test/Erc20Utils";
import {RunHelper} from "./RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];

  const controller = await DeployerUtils.connectProxy(core.controller, signer, "Controller") as Controller;
  const bookkeeper = await DeployerUtils.connectProxy(core.bookkeeper, signer, "Bookkeeper") as Bookkeeper;
  const ps = await DeployerUtils.connectVault(core.psVault, signer);

  const vaults = await bookkeeper.vaults();

  // noinspection InfiniteLoopJS
  while (true) {
    for (let vault of vaults) {
      const vaultContract = await DeployerUtils.connectVault(vault, signer);
      const strategy = await vaultContract.strategy();
      const stratContr = await DeployerUtils.connectInterface(signer, 'IStrategy', strategy) as IStrategy;
      const platform = await stratContr.platform();
      const vaultName = await vaultContract.name();

      // const platform = await
      if (!(await vaultContract.active()) || platform === 'NOOP') {
        continue;
      }
      const readyToClaim = await stratContr.readyToClaim();
      const rts = await stratContr.rewardTokens();

      let toClaimUsd = 0;

      for (let i = 0; i < rts.length; i++) {
        const rtDec = await Erc20Utils.decimals(rts[i]);
        const toClaim = readyToClaim[i];

        // todo price oracle
        toClaimUsd += +utils.formatUnits(toClaim, rtDec);
      }

      if (platform === 'NOOP' || toClaimUsd <= 0) {
        console.log('no rewards', vaultName, platform);
        continue;
      }

      const psPpfs = +utils.formatUnits(await ps.getPricePerFullShare());
      const iTokenBal = +utils.formatUnits(await Erc20Utils.balanceOf(core.rewardToken, vault));

      console.log('DoHardWork for', await vaultContract.name(), iTokenBal);
      console.log('ps share price', psPpfs);

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
