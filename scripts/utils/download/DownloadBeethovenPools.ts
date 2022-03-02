import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {
    IBeethovenxChef,
    IBPT,
    IBVault,
    IERC20Name,
} from "../../../typechain";
import {mkdir, writeFileSync} from "fs";
import {FtmAddresses} from "../../addresses/FtmAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const TOTAL_LP_TOKENS = 35;

const TOKEN_TO_POOL = new Map<string, string>([
    ['WFTM','0xcde5a11a4acb4ee4c805352cec57e236bdbc3837000200000000000000000019'],
    ['USDC','0x03c6b3f09d2504606936b1a4decefad204687890000200000000000000000015'],
]);

async function main() {
    const signer = (await ethers.getSigners())[0];
    const dataProvider = await DeployerUtils.connectInterface(
        signer, 'IBeethovenxChef', FtmAddresses.BEETS_MASTERCHEF) as IBeethovenxChef;


    let infos: string = 'idx, lp_name, lp_address, deposit_token, beethoven_pool_id, reward_to_deposit_pool_id\n';
    for (let i = 23; i < TOTAL_LP_TOKENS; i++) {
        console.log('id', i);
        if (i === 28 || i === 34) {
            console.log('skip', i);
            continue;
        }

        const bptAddress = await dataProvider.lpTokens(i);
        const bpt = await DeployerUtils.connectInterface(signer, "IBPT", bptAddress) as IBPT;
        const beethVaultAddr = await bpt.getVault();
        const beethVault = await DeployerUtils.connectInterface(signer, "IBVault", beethVaultAddr) as IBVault;

        const bptName = await bpt.symbol();
        const beethovenPoolId = await bpt.getPoolId();
        const poolTokens = (await beethVault.getPoolTokens(beethovenPoolId))[0];
        const res = (await findDepositToken(signer, poolTokens));
        let depositToken = '?';
        let rewardToDepositPoolId = '?';
        if(res !== undefined){
           depositToken = res[0];
           rewardToDepositPoolId = res[1];
        }

        const data = i + ',' +
          bptName + ',' +
          bptAddress + ',' +
          depositToken + ',' +
          beethovenPoolId + ',' +
          rewardToDepositPoolId

        console.log(data);
        infos += data + '\n';
    }

    mkdir('./tmp/download', {recursive: true}, (err) => {
      if (err) throw err;
    });

    writeFileSync('./tmp/download/beethoven_pools_raw_new.csv', infos, 'utf8');
    console.log('done');
}

async function findDepositToken(signer: SignerWithAddress, poolTokens: string[]){
    console.log("Pool tokens:");
    for (const t of poolTokens) {
        const token = await DeployerUtils.connectInterface(signer,"IERC20Name", t) as IERC20Name
        const tokenName = await token.symbol();
        let tokenPool = "?";
        console.log(tokenName, " :", t);
        if(TOKEN_TO_POOL.has(tokenName)){
            tokenPool = TOKEN_TO_POOL.get(tokenName) || '?';
            return [t, tokenPool]
        }
    }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
