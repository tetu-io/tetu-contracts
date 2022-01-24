import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  MultiRouter,
} from "../../typechain";
import {ethers, web3, network} from "hardhat";
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
  extractPairsFromRoutes,
  loadPairReserves,
  MULTI_ROUTER_MATIC
} from "../../scripts/multiswap/MultiRouterLib";
import pairsJson from '../../scripts/multiswap/json/MultiRouterPairs.json'

const pairs = pairsJson as string[][]

const {expect} = chai;
chai.use(chaiAsPromised);

let signer: SignerWithAddress;
let multiRouter: MultiRouter;

describe("MultiRouter base tests", function () {

  before(async function () {
    signer = (await ethers.getSigners())[0];
    console.log('network.name', network.name);
    if (network.name === 'matic') {
      multiRouter = await DeployerUtils.connectInterface(signer, "MultiRouter", MULTI_ROUTER_MATIC) as MultiRouter
    } else if (network.name === 'hardhat') {
      multiRouter = await DeployerUtils.deployContract(signer, 'MultiRouter') as MultiRouter;
    } else
      console.error('Unsupported network', network.name)
  })

  after(async function () {
  });

  it("generateWays", async () => {
    console.time('indexAllPairs')
    const allPairs = indexAllPairs(pairs)
    console.timeEnd('indexAllPairs')
    console.log('pairs.length', pairs.length);
    console.log('keys allPairs.length', Object.keys(allPairs).length);

    console.time('findAllRoutes')
    const allRoutes = findAllRoutes(
        allPairs,
        MaticAddresses.TETU_TOKEN,
        MaticAddresses.USDC_TOKEN,
        2)
    console.timeEnd('findAllRoutes')
    console.log('allRoutes', allRoutes);
    console.log('allRoutes.length', allRoutes.length);

    console.time('extractPairsFromRoutes')
    const usedPairs = extractPairsFromRoutes(allRoutes)
    console.timeEnd('extractPairsFromRoutes')
    const usedPairsKeys = Object.keys(usedPairs)
    console.log('usedPairsKeys.length', usedPairsKeys.length);

    console.time('loadPairReserves')
    await loadPairReserves(multiRouter, usedPairs)
    console.timeEnd('loadPairReserves')
    // console.log('usedPairs', usedPairs);
  })


})
