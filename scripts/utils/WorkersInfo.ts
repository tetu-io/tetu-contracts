import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {PayrollClerk} from "../../typechain";
import {mkdir, writeFileSync} from "fs";


async function main() {
  const tools = await DeployerUtils.getToolsAddresses();
  const signer = (await ethers.getSigners())[0];

  const clerk = await DeployerUtils.connectInterface(signer, 'PayrollClerk', tools.payrollClerk) as PayrollClerk;


  const workers = await clerk.allWorkers();
  console.log('workers', workers.length);

  let data = 'address, name, role, base rate, rate, boost, hours, earned\n';
  for (let workerAdr of workers) {
    let workerInfo = '';
    workerInfo += workerAdr + ',';
    workerInfo += await clerk.workerNames(workerAdr) + ',';
    workerInfo += await clerk.workerRoles(workerAdr) + ',';
    workerInfo += await clerk.baseHourlyRates(workerAdr) + ',';
    workerInfo += await clerk.hourlyRate(workerAdr) + ',';
    workerInfo += await clerk.boostActivated(workerAdr) + ',';
    workerInfo += await clerk.workedHours(workerAdr) + ',';
    workerInfo += await clerk.earned(workerAdr);
    console.log('workerInfo', workerInfo);
    data += workerInfo + '\n';
  }

  mkdir('./tmp', {recursive: true}, (err) => {
    if (err) throw err;
  });

  await writeFileSync(`./tmp/workers.csv`, data, 'utf8');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
