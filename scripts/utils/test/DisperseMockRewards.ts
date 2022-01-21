import { ethers } from "hardhat";
import { DeployerUtils } from "../../deploy/DeployerUtils";
import {
  Bookkeeper,
  ERC20PresetMinterPauser,
  NotifyHelper,
} from "../../../typechain";
import { TokenUtils } from "../../../test/TokenUtils";
import { BigNumber, utils } from "ethers";
import { RunHelper } from "../tools/RunHelper";

async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const notifyHelper = (await DeployerUtils.connectContract(
    signer,
    "NotifyHelper",
    core.notifyHelper
  )) as NotifyHelper;
  const bookkeeper = (await DeployerUtils.connectContract(
    signer,
    "Bookkeeper",
    core.bookkeeper
  )) as Bookkeeper;

  const vaults = await bookkeeper.vaults();
  console.log("vaults size", vaults.length);

  const vaultsPerRt = new Map<string, string[]>();
  const allAmounts: Map<string, BigNumber[]> = new Map<string, BigNumber[]>();
  const allSum: Map<string, BigNumber> = new Map<string, BigNumber>();
  let i = 0;
  for (const vault of vaults) {
    const vaultContract = await DeployerUtils.connectVault(vault, signer);

    if (!(await vaultContract.active())) {
      continue;
    }

    const rts: string[] = await vaultContract.rewardTokens();

    for (const rt of rts) {
      if (rt === core.psVault) {
        continue;
      }

      const rtDecimals = await TokenUtils.decimals(rt);

      const mockContract = (await DeployerUtils.connectContract(
        signer,
        "ERC20PresetMinterPauser",
        rt
      )) as ERC20PresetMinterPauser;
      await mockContract.mint(
        signer.address,
        utils.parseUnits("100000", rtDecimals)
      );

      const availableAmount = +(+utils.formatUnits(
        await TokenUtils.balanceOf(rt, signer.address),
        rtDecimals
      )).toFixed();
      console.log("availableAmount", availableAmount);
      const amountN = (availableAmount / vaults.length / 2).toFixed();
      console.log("amountN", amountN);

      const amount = utils.parseUnits(amountN, rtDecimals);

      let amounts = allAmounts.get(rt) as BigNumber[];
      if (!amounts) {
        amounts = [];
        allAmounts.set(rt, amounts);
      }
      amounts.push(amount);

      let sum = allSum.get(rt) as BigNumber;
      if (!sum) {
        sum = BigNumber.from(0);
      }
      sum = sum.add(amount);
      allSum.set(rt, sum);

      let v = vaultsPerRt.get(rt) as string[];
      if (!v) {
        v = [];
        vaultsPerRt.set(rt, v);
      }
      v.push(vault);
    }
    i++;

    if (i >= 50 || i === vaults.length - 1) {
      for (const rt of Array.from(allSum.keys())) {
        const rtDecimals = await TokenUtils.decimals(rt);
        const amounts = allAmounts.get(rt) as BigNumber[];
        const sum = allSum.get(rt) as BigNumber;
        const vlts = vaultsPerRt.get(rt) as string[];

        const bal = utils.formatUnits(
          await TokenUtils.balanceOf(rt, signer.address),
          rtDecimals
        );
        console.log(
          "notify",
          rt,
          amounts.length,
          vlts.length,
          bal,
          utils.formatUnits(sum, rtDecimals)
        );

        await TokenUtils.transfer(
          rt,
          signer,
          notifyHelper.address,
          sum.toString()
        );
        await RunHelper.runAndWait(() =>
          notifyHelper.notifyVaults(amounts, vlts, sum, rt)
        );
      }
      i = 0;
      allSum.clear();
      allAmounts.clear();
      vaultsPerRt.clear();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
