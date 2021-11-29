import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {ICosmicMasterChef} from "../../../typechain";
import {BigNumber} from "ethers";
import {McLpDownloader} from "./McLpDownloader";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const chef = await DeployerUtils.connectInterface(signer, 'ICosmicMasterChef', MaticAddresses.COSMIC_MASTERCHEF) as ICosmicMasterChef;

  await McLpDownloader.download(
      "6",
      'COSMIC',
      MaticAddresses.COSMIC_MASTERCHEF,
      MaticAddresses.COSMIC_TOKEN,
      chef.poolLength,
      chef.cosmicPerBlock,
      chef.totalAllocPoint,
      async (id) => {
        return chef.poolInfo(id)
        .then(info => {
          return {
            "lpAddress": info[0] as string,
            "allocPoint": info[1] as BigNumber,
            "lastUpdateTime": info[2].toNumber()
          };
        });
      }
  );
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
