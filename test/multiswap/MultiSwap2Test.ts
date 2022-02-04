import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  MultiSwap2,
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
  encodeRouteData,
  saveObjectToJsonFile
} from "../../scripts/multiswap/MultiSwapLib";
import pairsJson from '../../scripts/multiswap/json/MultiSwapPairs.json'

import savedRoute from './json/AAVE_USDC.json';

const encodedRouteDataFileName = 'test/multiswap/json/AAVE_USDC.json';
const pairs = pairsJson as string[][]

// const {expect} = chai;
chai.use(chaiAsPromised);

let signer: SignerWithAddress;
let multiSwap2: MultiSwap2;

describe("MultiSwap2 base tests", function () {

  before(async function () {
    signer = (await ethers.getSigners())[0];
    console.log('network.name', network.name);
    if (network.name === 'matic') {
      multiSwap2 = await DeployerUtils.connectInterface(
          signer, "MultiSwap2", MULTI_SWAP_LOADER_MATIC) as MultiSwap2
    } else if (network.name === 'hardhat') {
      multiSwap2 = await DeployerUtils.deployContract(signer, 'MultiSwap2',
          signer.address, [], [] // TODO fill factories and routes constructor params
      ) as MultiSwap2;
    } else
      console.error('Unsupported network', network.name)
  })

  after(async function () {
  });

  it("generateWays", async () => {
    const tokenIn = MaticAddresses.AAVE_TOKEN;
    const tokenOut = MaticAddresses.USDC_TOKEN;
    const amount = ethers.utils.parseUnits('5000', 'ether');

    let encodedRoutesData: string;
    if (network.name === 'matic') {
      console.time('getAllRoutes')
      const allRoutes = getAllRoutes(pairs, tokenIn, tokenOut, 4);
      console.timeEnd('getAllRoutes')
      console.log('allRoutes.length', allRoutes.length);

      console.time('loadReserves')
      await loadReserves(multiSwap2, allRoutes)
      console.timeEnd('loadReserves')

      const routesData = findBestRoutes(allRoutes, amount)
      console.log('routesData', routesData);

      encodedRoutesData = encodeRouteData(routesData);
      saveObjectToJsonFile({data: encodedRoutesData}, encodedRouteDataFileName)
      console.log('encodedRoutesData', encodedRoutesData);
    } else {
      encodedRoutesData = savedRoute.data;
    }

    await multiSwap2.multiSwap(tokenIn, tokenOut, amount, 1, encodedRoutesData, false);

  })


})
