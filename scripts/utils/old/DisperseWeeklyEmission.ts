import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper, NotifyHelper} from "../../../typechain";
import {readFileSync} from "fs";
import {expect} from "chai";
import {BigNumber} from "ethers";
import {RunHelper} from "../RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const notifyHelper = await DeployerUtils.connectContract(
      signer, "NotifyHelper", core.notifyHelper) as NotifyHelper;
  const bookkeeper = await DeployerUtils.connectContract(
      signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;

  const data = readFileSync('tmp/to_distribute_130.txt', 'utf8').split(/\r?\n/);
  const batch = 20;


  const excluded = new Set<string>([

  ])


  const vaults = data[0].split(',');
  const amounts = data[1].split(',');
  const sum = data[2];

  expect(vaults.length).is.eq(amounts.length, 'wrong arrays');

  const batches = [];
  let vaultsForSend = [];
  let amountsForSend = [];
  let sumForSend = BigNumber.from(0);
  for (let i = 0; i < vaults.length; i++) {
    console.log('i', vaults[i], amounts[i]);
    vaultsForSend.push(vaults[i]);
    amountsForSend.push(amounts[i]);
    sumForSend = sumForSend.add(BigNumber.from(amounts[i]));

    if (i !== 0 && ((i + 1) % batch === 0 || i === vaults.length - 1)) {
      const v: string[] = [];
      const a: string[] = [];
      vaultsForSend.forEach(x => v.push(x));
      amountsForSend.forEach(x => a.push(x));
      console.log('batch -----------------------------', batches.length, vaultsForSend.length, v.length)
      batches.push({
        "v": v,
        "a": a,
        "s": BigNumber.from(sumForSend.toString())
      });
      vaultsForSend = [];
      amountsForSend = [];
      sumForSend = BigNumber.from(0);
    }
  }

  let sumFinal = BigNumber.from(0);
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];

    for (let v of b.v) {
      if (excluded.has(v.toLowerCase())) {
        throw Error("v exist " + v);
      }
    }

    // console.log(b.v.length);
    // console.log(b.a.length);
    // console.log(b.s.toString());

    sumFinal = sumFinal.add(b.s);

    // console.log(b.v, b.a, b.s, core.rewardToken);

    // await RunHelper.runAndWait(() =>
    //     notifyHelper.notifyVaults(b.a, b.v, b.s, core.rewardToken));
  }

  console.log('sum', sumFinal.toString());
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
