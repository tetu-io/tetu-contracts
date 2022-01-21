import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  MultiRouter,
} from "../../typechain";
import {ethers, web3} from "hardhat";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {BigNumberish} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  loadAllPairs,
  Pair,
  saveObjectToJsonFile,
  indexAllPairs,
  findAllRoutes,
  extractPairsFromRoutes
} from "../../scripts/multiswap/MultiRouterLib";
import pairsJson from '../../scripts/multiswap/json/MultiRouterPairs.json'

const pairs = pairsJson as string[][]

const {expect} = chai;
chai.use(chaiAsPromised);

describe("MultiRouter base tests", function () {

  before(async function () {

  })

  after(async function () {
  });

  it("generateWays", async () => {
    console.time()
    const allPairs = indexAllPairs(pairs)
    console.timeEnd()
    console.log('pairs.length', pairs.length);
    console.log('keys allPairs.length', Object.keys(allPairs).length);

    const allRoutes = findAllRoutes(
        allPairs,
        MaticAddresses.TETU_TOKEN,
        MaticAddresses.USDC_TOKEN,
        2)
    console.log('allRoutes', allRoutes);
    console.log('allRoutes.length', allRoutes.length);
    console.time()
    const usedPairs = extractPairsFromRoutes(allRoutes)
    console.timeEnd()
    console.log('usedPairs.length', usedPairs.length);
  })


})
