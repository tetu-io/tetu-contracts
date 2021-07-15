import {DeployerUtils} from "../../DeployerUtils";
import {ethers} from "hardhat";
import {MockFaucet} from "../../../../typechain/MockFaucet";
import {RunHelper} from "../../../utils/RunHelper";
import {Erc20Utils} from "../../../../test/Erc20Utils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const mocks = await DeployerUtils.getTokenAddresses();
  const contract = await DeployerUtils.deployContract(signer, "MockFaucet") as MockFaucet;


  for (let mockName of Array.from(mocks.keys())) {
    const mock = mocks.get(mockName) as string;
    await RunHelper.runAndWait(() => contract.addToken(mock));

    const balance = await Erc20Utils.balanceOf(mock, signer.address);
    if (balance.isZero()) {
      continue;
    }
    //send a half
    await RunHelper.runAndWait(() =>
        Erc20Utils.transfer(mock, signer, contract.address, balance.div(2).toString()));
  }


  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
