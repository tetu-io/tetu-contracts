import {ethers, web3} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, ContractReader, ContractUtils, SmartVault} from "../../typechain";
import {mkdir, writeFileSync} from "fs";
import {utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const vaultsForParsing = new Set<string>([
  "0x6C3246e749472879D1088C24Dacd2A37CAaEe9B1".toLowerCase(),
  "0xd5c5fc773883289778092e864afE015979A10eb9".toLowerCase(),
  "0x3Fd0A8a975eC101748aE931B2d13711E04231920".toLowerCase(),
  "0xe29d72E3f072A6B93F54F08C8644Dd3429Fe69a7".toLowerCase(),
  "0xa5218933721D2fa8Bb95e5f02D32d3FE0a9039F8".toLowerCase(),
  "0xC6f6e9772361A75988C6CC248a3945a870FB1272".toLowerCase(),
  "0x46e8E75484eE655C374B608842ACd41B2eC3f11C".toLowerCase(),
  "0xb831c5A919983F88D2220E2fF591550513Dd2236".toLowerCase(),
  "0x087b137545dBe79594d76F9122A12bdf5cf12AD4".toLowerCase(),
  "0xA842cee4E5e4537718B5cA37145f6BdF606014f5".toLowerCase(),
  "0x8846715645A06a5c46309dC29623793D97795242".toLowerCase(),
  "0x5C65bdebca760d113B4Ef334013eAFf07779F00b".toLowerCase(),
  "0xB564D64014F52fd7Eb1CB7e639C134Ec24C76Ed2".toLowerCase(),
  "0x3b9AFEBaD9490916aC286EAe9005921eFdfc29a0".toLowerCase(),
  "0xCd72ec3d469ecFCf37CBB7979d8F916dDdE939cE".toLowerCase(),
  "0x0163948cda17ca2a313F00B7F0301BB3Bf98dBb0".toLowerCase(),
  "0x0E90bF48b16C5B409Dc33e261EfCa205623fe686".toLowerCase(),
  "0xF99F5B28093BfA3B04c8c6a0225580236BeBbFfd".toLowerCase(),
]);

const EVENT_DEPOSIT = '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c';
const START_BLOCK = 17462342;
const STEP = 2000;

async function main() {
  const signer = (await ethers.getSigners())[1];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;

  mkdir('./tmp/stats', {recursive: true}, (err) => {
    if (err) throw err;
  });

  const vaults = await bookkeeper.vaults();

  console.log('vaults', vaults.length);

  const currentBlock = await web3.eth.getBlockNumber();
  console.log('current block', currentBlock);


  let data = '';
  const usersTotal = new Set<string>();
  let vaultUnclaimed = "";

  for (let vault of vaults) {

    try {
      if (vault.toLowerCase() == core.psVault.toLowerCase()
          || !vaultsForParsing.has(vault.toLowerCase())
      ) {
        continue;
      }
      // const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

      const vaultName = await cReader.vaultName(vault);
      console.log('vault name', vaultName);

      let start = (await cReader.vaultCreated(vault)).toNumber();
      let end = START_BLOCK + STEP;
      const logs = [];
      while (true) {
        logs.push(...(await web3.eth.getPastLogs({
          fromBlock: start,
          toBlock: end,
          address: vault,
          topics: [EVENT_DEPOSIT]
        })));

        start = end;
        end = start + STEP;

        if (start > currentBlock) {
          break;
        }
      }

      console.log('logs', logs.length);

      const users = new Map<string, string>();
      for (let log of logs) {
        const logDecoded = web3.eth.abi.decodeLog([
              {
                "indexed": true,
                "internalType": "address",
                "name": "beneficiary",
                "type": "address"
              },
              {
                "indexed": false,
                "internalType": "uint256",
                "name": "amount",
                "type": "uint256"
              }],
            log.data,
            log.topics.slice(1));
        usersTotal.add(logDecoded.beneficiary);
        users.set(logDecoded.beneficiary, '0');
      }
      console.log('users', users.size);

      let totalToClaim = 0;
      for (let userAddress of Array.from(users.keys())) {
        const userToClaim = utils.formatUnits((await cReader.userRewards(userAddress, vault))[0]);
        if (+userToClaim === 0) {
          continue;
        }
        totalToClaim += +userToClaim;
        data += `${vaultName},${vault},${userAddress},${userToClaim}\n`;
      }
      vaultUnclaimed += `${vaultName},${vault},${totalToClaim}\n`;
      await writeFileSync(`./tmp/stats/to_claim_partially.txt`, data, 'utf8');
      await writeFileSync(`./tmp/stats/unclaimed_partially.txt`, vaultUnclaimed, 'utf8');
    } catch (e) {
      console.error('error with vault ', vault, e);
    }

  }

  data += await collectPs(usersTotal, core.psVault, vaults, signer, tools.utils);

  await writeFileSync(`./tmp/stats/to_claim.txt`, data, 'utf8');
  await writeFileSync(`./tmp/stats/unclaimed.txt`, vaultUnclaimed, 'utf8');
}


main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});


async function collectPs(
    usersTotal: Set<string>,
    psAdr: string,
    vaults: string[],
    signer: SignerWithAddress,
    utilsAdr: string
): Promise<string> {

  let data = '';
  const exclude = new Set<string>(vaults);

  const contractUtils = await DeployerUtils.connectInterface(signer, 'ContractUtils', utilsAdr) as ContractUtils;
  const psContr = await DeployerUtils.connectInterface(signer, 'SmartVault', psAdr) as SmartVault;

  const ppfs = +utils.formatUnits(await psContr.getPricePerFullShare());

  const usersBatches = [];
  const batchSize = 150;
  let i = 0;
  let batch = [];
  for (let user of Array.from(usersTotal.keys())) {
    if (exclude.has(user) || !user || !psAdr) {
      continue;
    }

    batch.push(user);

    i++;
    if (i % batchSize === 0 || i === usersTotal.size) {
      usersBatches.push(batch);
      batch = [];
      i = 0;
    }
  }

  for (let batch of usersBatches) {

    const balances = await contractUtils.erc20BalancesForAddresses(psAdr, batch);

    for (let i = 0; i < balances.length; i++) {

      const toClaim = +utils.formatUnits(balances[i]);
      if (toClaim > 0) {
        data += `TETU_PS,${psAdr},${batch[i]},${toClaim * ppfs}\n`;
      }
    }

  }


  await writeFileSync(`./tmp/stats/to_claim_ps.txt`, data, 'utf8');

  return data;
}
