import {
  ContractUtils
} from "../../typechain";
import {MaticAddresses} from "../addresses/MaticAddresses";
import {loadAllPairs, saveObjectToJsonFile, CONTRACT_UTILS_MATIC} from "./MultiSwapLibrary";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {ethers} from "hardhat";

const pairsFileName = 'scripts/multiswap/json/MultiSwapPairs.json'
let signer: SignerWithAddress;
let contractUtils: ContractUtils;

const factories = [
  MaticAddresses.TETU_SWAP_FACTORY,
  MaticAddresses.QUICK_FACTORY,
  MaticAddresses.SUSHI_FACTORY,
]

async function main() {
  signer = (await ethers.getSigners())[0];
  // MultiSwapLoader = await DeployerUtils.deployContract(signer, 'MultiRouter') as MultiRouter;
  contractUtils = await DeployerUtils.connectInterface(
      signer, "ContractUtils", CONTRACT_UTILS_MATIC) as ContractUtils

  const pairs = await loadAllPairs(contractUtils, factories)
  console.log('pairs.length', pairs.length);
  await saveObjectToJsonFile(pairs, pairsFileName)
  console.log('saved to', pairsFileName);
}

main().then()
