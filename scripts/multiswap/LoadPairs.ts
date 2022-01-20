import {
  Controller,
  MultiRouter,
} from "../../typechain";
import {MaticAddresses} from "../addresses/MaticAddresses";
import {loadAllPairs, Pair, saveObjectToJsonFile} from "./MultiRouterLib";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {ethers} from "hardhat";

const MULTI_ROUTER = '0xfD965c24c9b9B33802d6064549CC4d0b9A604786'
const pairsFileName = 'scripts/multiswap/json/MultiRouterPairs.json'
let signer: SignerWithAddress;
let multiRouter: MultiRouter;

const factories = [
  MaticAddresses.TETU_SWAP_FACTORY,
  MaticAddresses.QUICK_FACTORY,
  MaticAddresses.SUSHI_FACTORY,
]

let pairs: Pair[];

async function main() {
  signer = (await ethers.getSigners())[0];
  // multiRouter = await DeployerUtils.deployContract(signer, 'MultiRouter') as MultiRouter;
  multiRouter = await DeployerUtils.connectInterface(signer, "MultiRouter", MULTI_ROUTER) as MultiRouter

  pairs = await loadAllPairs(multiRouter, factories)
  console.log('pairs.length', pairs.length);
  await saveObjectToJsonFile(pairs, pairsFileName)
  console.log('saved to', pairsFileName);
}

main().then()
