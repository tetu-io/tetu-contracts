import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {ICafeMasterChef} from "../../../typechain";
import {BigNumber, utils} from "ethers";
import {McLpDownloader} from "./McLpDownloader";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const chef = await DeployerUtils.connectInterface(
      signer, 'ICafeMasterChef', MaticAddresses.CAFE_MASTERCHEF) as ICafeMasterChef;

  await McLpDownloader.download(
      '11',
      'CAFE',
      MaticAddresses.CAFE_MASTERCHEF,
      MaticAddresses.pBREW_TOKEN,
      chef.poolLength,
      chef.brewPerBlock,
      chef.totalAllocPoint,
      (id) => {
        return chef.poolInfo(id)
        .then(info => {
          return {
            "lpAddress": info.lpToken,
            "allocPoint": info.allocPoint,
            "lastUpdateTime": info.lastRewardBlock.toNumber(),
            "depositFeeBP": info.depositFeeBP
          };
        });
      },
      true
  );
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
