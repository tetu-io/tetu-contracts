import { DeployerUtils } from "../../DeployerUtils";
import { ethers } from "hardhat";
import { RunHelper } from "../../../utils/tools/RunHelper";
import { TokenUtils } from "../../../../test/TokenUtils";
import { MockFaucet } from "../../../../typechain";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const mocks = await DeployerUtils.getTokenAddresses();
  const contract = (await DeployerUtils.deployContract(
    signer,
    "MockFaucet"
  )) as MockFaucet;

  for (const mockName of Array.from(mocks.keys())) {
    const mock = mocks.get(mockName) as string;
    await RunHelper.runAndWait(() => contract.addToken(mock));

    const balance = await TokenUtils.balanceOf(mock, signer.address);
    if (balance.isZero()) {
      continue;
    }
    // send a half
    await RunHelper.runAndWait(async () =>
      TokenUtils.transfer(
        mock,
        signer,
        contract.address,
        balance.div(2).toString()
      )
    );
  }

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
