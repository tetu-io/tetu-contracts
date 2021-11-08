import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, TetuSwapFactory, TetuSwapPair} from "../../typechain";
import {RunHelper} from "./RunHelper";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];

  const factory = await DeployerUtils.connectInterface(signer, 'TetuSwapFactory', core.swapFactory) as TetuSwapFactory;
  const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;

  const lpCount = (await factory.allPairsLength()).toNumber();
  const pairMap = new Map<string, Set<string>>();

  for (let i = 0; i < lpCount; i++) {
    try {
      const lp = await factory.allPairs(i);
      const lpCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', lp) as TetuSwapPair;

      const v0 = (await lpCtr.vault0()).toLowerCase();
      const v1 = (await lpCtr.vault1()).toLowerCase();
      if (!pairMap.get(v0)) {
        pairMap.set(v0, new Set<string>());
      }
      if (!pairMap.get(v1)) {
        pairMap.set(v1, new Set<string>());
      }

      pairMap.get(v0)?.add(lp)
      pairMap.get(v1)?.add(lp)

      await RunHelper.runAndWait(() => lpCtr.sync());
    } catch (e) {
      console.log('Loop Error', e);
    }
  }
  console.log('all pairs synced', pairMap.size);


  const actionEvent = bookkeeper.filters.RegisterUserAction(null, null, null);
  bookkeeper.on(actionEvent, async (user, amount, deposit, event) => {
    console.log('catch user action', user, amount.toString(), deposit, event);
    const tx = await ethers.provider.getTransaction(event.transactionHash);
    console.log('tx', tx);
    const vault = tx.to?.toLowerCase() as string;
    const pairs = pairMap.get(vault) as Set<string>;
    for (const lp of Array.from(pairs.keys())) {
      const lpCtr = await DeployerUtils.connectInterface(signer, 'TetuSwapPair', lp) as TetuSwapPair;
      console.log('sync ', lp);
      await lpCtr.sync();
    }
  })

  // noinspection InfiniteLoopJS
  while (true) {
    console.log('Waiting for events....');
    await DeployerUtils.delay(1000 * 60);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
