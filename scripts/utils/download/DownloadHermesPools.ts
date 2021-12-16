import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {IIrisMasterChef} from "../../../typechain";
import {BigNumber} from "ethers";
import {McLpDownloader} from "./McLpDownloader";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const chef = await DeployerUtils.connectInterface(
      signer, 'IIrisMasterChef', MaticAddresses.HERMES_MASTERCHEF) as IIrisMasterChef;

  await McLpDownloader.download(
      '10',
      'HERMES',
      MaticAddresses.HERMES_MASTERCHEF,
      MaticAddresses.IRIS_TOKEN,
      chef.poolLength,
      chef.irisPerBlock,
      chef.totalAllocPoint,
      async (id) => {
        return chef.poolInfo(id)
        .then(info => {
          return {
            "lpAddress": info[0] as string,
            "allocPoint": info[1] as BigNumber,
            "lastUpdateTime": info[2].toNumber(),
            "depositFeeBP": info[4]
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
