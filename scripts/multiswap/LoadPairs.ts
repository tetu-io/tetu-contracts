import {
  MultiSwap2,
} from "../../typechain";
import {MaticAddresses} from "../addresses/MaticAddresses";
import {loadAllPairs, saveObjectToJsonFile, MULTI_SWAP2_MATIC} from "./MultiSwapLib";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {ethers} from "hardhat";

const pairsFileName = 'scripts/multiswap/json/MultiSwapPairs.json'
let signer: SignerWithAddress;
let multiSwapLoader: MultiSwap2;

const factories = [
  MaticAddresses.TETU_SWAP_FACTORY,
  MaticAddresses.QUICK_FACTORY,
  MaticAddresses.SUSHI_FACTORY,
]

async function main() {
  signer = (await ethers.getSigners())[0];
  // MultiSwapLoader = await DeployerUtils.deployContract(signer, 'MultiRouter') as MultiRouter;
  multiSwapLoader = await DeployerUtils.connectInterface(
      signer, "MultiSwap2", MULTI_SWAP2_MATIC) as MultiSwap2

  const pairs = await loadAllPairs(multiSwapLoader, factories)
  console.log('pairs.length', pairs.length);
  await saveObjectToJsonFile(pairs, pairsFileName)
  console.log('saved to', pairsFileName);
}

main().then()
