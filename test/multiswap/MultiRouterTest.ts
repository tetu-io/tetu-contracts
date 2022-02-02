import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  MultiSwapLoader,
} from "../../typechain";
import {ethers, network} from "hardhat";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
// import {BigNumber, BigNumberish} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  getAllRoutes,
  loadReserves,
  MULTI_SWAP_LOADER_MATIC,
  findBestRoutes,
  encodeRouteData
} from "../../scripts/multiswap/MultiSwapLib";
import pairsJson from '../../scripts/multiswap/json/MultiSwapPairs.json'

const pairs = pairsJson as string[][]

const {expect} = chai;
chai.use(chaiAsPromised);

let signer: SignerWithAddress;
let multiSwapLoader: MultiSwapLoader;

describe("MultiSwapLoader base tests", function () {

  before(async function () {
    signer = (await ethers.getSigners())[0];
    console.log('network.name', network.name);
    if (network.name === 'matic') {
      multiSwapLoader = await DeployerUtils.connectInterface(
          signer, "MultiSwapLoader", MULTI_SWAP_LOADER_MATIC) as MultiSwapLoader
    } else if (network.name === 'hardhat') {
      multiSwapLoader = await DeployerUtils.deployContract(signer, 'MultiSwapLoader') as MultiSwapLoader;
    } else
      console.error('Unsupported network', network.name)
  })

  after(async function () {
  });

  it("generateWays", async () => {
    console.time('getAllRoutes')
    const allRoutes = getAllRoutes(
        pairs,
        // MaticAddresses.TETU_TOKEN, MaticAddresses.USDC_TOKEN,
        // MaticAddresses.USDC_TOKEN, MaticAddresses.USDC_TOKEN,
        // MaticAddresses.TETU_TOKEN, MaticAddresses.TETU_TOKEN,
        // MaticAddresses.WMATIC_TOKEN, MaticAddresses.WMATIC_TOKEN,
        MaticAddresses.AAVE_TOKEN, MaticAddresses.USDC_TOKEN,
        4)
    console.timeEnd('getAllRoutes')
    console.log('allRoutes', allRoutes);
    console.log('allRoutes.length', allRoutes.length);


    console.time('loadReserves')
    await loadReserves(multiSwapLoader, allRoutes)
    console.timeEnd('loadReserves')

    const amountIn = ethers.utils.parseUnits('5000', 'ether')
    const routesData = findBestRoutes(allRoutes, amountIn)
    console.log('routesData', routesData);

    const encodedData = encodeRouteData(routesData);
    console.log('encodedData', encodedData);

  })


})
