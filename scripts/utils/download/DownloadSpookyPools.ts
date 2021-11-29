import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ISpookyMasterChef} from "../../../typechain";
import {McLpDownloader} from "./McLpDownloader";
import {FtmAddresses} from "../../addresses/FtmAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const chef = await DeployerUtils.connectInterface(
    signer, 'ISpookyMasterChef', FtmAddresses.SPOOKY_MASTERCHEF) as ISpookyMasterChef;

  await McLpDownloader.download(
    '13',
    'SPOOKY',
    FtmAddresses.SPOOKY_MASTERCHEF,
    FtmAddresses.BOO_TOKEN,
    chef.poolLength,
    chef.booPerSecond,
    chef.totalAllocPoint,
    async (id) => {
      return chef.poolInfo(id)
        .then(info => {
          return {
            "lpAddress": info.lpToken,
            "allocPoint": info.allocPoint,
            "lastUpdateTime": info.lastRewardTime.toNumber(),
            "depositFeeBP": 0
          };
        });
    },
    false
  );
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
