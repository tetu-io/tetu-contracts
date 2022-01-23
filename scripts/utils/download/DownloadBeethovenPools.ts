import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {IAaveProtocolDataProvider, IAToken, IBeethovenxChef, IBPT,} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {mkdir, writeFileSync} from "fs";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {FtmAddresses} from "../../addresses/FtmAddresses";

const TOTAL_LP_TOKENS = 35;

async function main() {
    const signer = (await ethers.getSigners())[0];
    const dataProvider = await DeployerUtils.connectInterface(
        signer, 'IBeethovenxChef', FtmAddresses.BEETS_MASTERCHEF) as IBeethovenxChef;


    let infos: string = 'idx, lp_name, lp_address, deposit_token, beethoven_pool_id, reward_to_deposit_pool_id\n';
    for (let i = 0; i < 22; i++) {
        console.log('id', i);

        if (i === 22) {
          console.log('skip broken assets')
          continue;
        }
        const bptAddress = await dataProvider.lpTokens(i);
        const bpt = await DeployerUtils.connectInterface(signer, "IBPT", bptAddress) as IBPT;
        const bptName = await bpt.symbol();
        const beethovenPoolId = await bpt.getPoolId();
        const depositToken = '?';
        const rewardToDepositPoolId = '?';

        const data = i + ',' +
          bptName + ',' +
          bptAddress + ',' +
          depositToken + ',' +
          beethovenPoolId + ',' +
          rewardToDepositPoolId

        console.log(data);
        infos += data + '\n';
    }

//     mkdir('./tmp/download', {recursive: true}, (err) => {
//       if (err) throw err;
//     });
//
    // console.log('data', data);
    writeFileSync('/Users/anatseuski/work/tetu-contracts/scripts/utils/download/data/beethoven_pools_raw.csv', infos, 'utf8');
    console.log('done');
}
main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
