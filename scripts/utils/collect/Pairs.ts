import { DeployerUtils } from '../../deploy/DeployerUtils';
import { ethers } from 'hardhat';
import { writeFileSync } from 'fs';
import { TetuSwapFactory, TetuSwapPair__factory } from '../../../typechain';

async function main() {
  const signer = (await ethers.getSigners())[0];
  const coreAdrs = await DeployerUtils.getCoreAddresses();

  const factory = (await DeployerUtils.connectInterface(
    signer,
    'TetuSwapFactory',
    coreAdrs.swapFactory
  )) as TetuSwapFactory;

  let txt = '';
  const l = (await factory.allPairsLength()).toNumber();
  for (let i = 0; i < l; i++) {
    const pair = await factory.allPairs(i);
    const name = await TetuSwapPair__factory.connect(pair, signer).symbol();
    txt += `${name} - ${pair}\n`;
    console.log(txt);
  }
  writeFileSync(`./tmp/pairs.txt`, txt, 'utf8');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
