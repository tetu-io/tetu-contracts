import {ethers, web3} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, ContractReader, ContractUtils, SmartVault} from "../../typechain";
import {mkdir, writeFileSync} from "fs";
import {utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";


const EVENT_DEPOSIT = '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c';
const START_BLOCK = 17462342;
const STEP = 9_999;

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

  for (let vault of vaults) {

    try {
      if (vault.toLowerCase() == core.psVault.toLowerCase()) {
        continue;
      }
      // const vaultCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;

      const vaultName = await cReader.vaultName(vault);
      console.log('vault name', vaultName);

      let start = START_BLOCK;
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
      await writeFileSync(`./tmp/stats/to_claim_partially.txt`, data, 'utf8');
    } catch (e) {
      console.error('error with vault ', vault, e);
    }

  }

  data += await collectPs(usersTotal, core.psVault, vaults, signer, tools.utils);

  await writeFileSync(`./tmp/stats/to_claim.txt`, data, 'utf8');
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
