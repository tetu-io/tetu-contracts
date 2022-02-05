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
  MULTI_SWAP2_MATIC,
  findBestRoutes,
  encodeRouteData,
  saveObjectToJsonFile
} from "../../scripts/multiswap/MultiSwapLib";
import pairsJson from '../../scripts/multiswap/json/MultiSwapPairs.json'

import savedRoute from './json/USDC_AAVE.json';
import {TokenUtils} from "../TokenUtils";
import {utils} from "ethers";

const encodedRouteDataFileName = 'test/multiswap/json/USDC_AAVE.json';
const pairs = pairsJson as string[][]

// const {expect} = chai;
chai.use(chaiAsPromised);

let signer: SignerWithAddress;
let multiSwap2: MultiSwap2;

const FACTORIES_MATIC = [
  MaticAddresses.TETU_SWAP_FACTORY,
  MaticAddresses.QUICK_FACTORY,
  MaticAddresses.SUSHI_FACTORY,
]

const ROUTERS_MATIC = [
  MaticAddresses.TETU_SWAP_ROUTER,
  MaticAddresses.QUICK_ROUTER,
  MaticAddresses.SUSHI_ROUTER,
]

describe("MultiSwap2 base tests", function () {

  before(async function () {
    signer = (await ethers.getSigners())[0];
    console.log('network.name', network.name);

    if (network.name === 'matic') {

      multiSwap2 = await DeployerUtils.connectInterface(
          signer, "MultiSwap2", MULTI_SWAP2_MATIC
      ) as MultiSwap2;

    } else if (network.name === 'hardhat') {

      multiSwap2 = await DeployerUtils.deployContract(signer, 'MultiSwap2',
          signer.address, FACTORIES_MATIC, ROUTERS_MATIC
      ) as MultiSwap2;

      const usdc = await DeployerUtils.getUSDCAddress();
      await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('500000', 6));

    } else console.error('Unsupported network', network.name)

  })

  after(async function () {
  });

  it("generateWays", async () => {
    const tokenIn = MaticAddresses.USDC_TOKEN;
    const tokenOut = MaticAddresses.AAVE_TOKEN;
    const amount = ethers.utils.parseUnits('500000', 6);

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
      await saveObjectToJsonFile({data: encodedRoutesData}, encodedRouteDataFileName)
      console.log('encodedRoutesData', encodedRoutesData);
      console.log('+++ Route data saved to ', encodedRouteDataFileName);
    } else {
      encodedRoutesData = savedRoute.data;
      await multiSwap2.multiSwap(tokenIn, tokenOut, amount, 1, encodedRoutesData, false);
    }


  })


})
