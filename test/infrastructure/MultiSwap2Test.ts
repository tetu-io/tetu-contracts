// WARNING!:
// Run this test on Matic network first - to build token swap route data
// Because it runs too long at forked network
// Then run at fork - to test swaps itself
// Do not forget to update fork block to have same state with network

import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  MultiSwap2, ContractUtils,
} from "../../typechain";
import {ethers, network} from "hardhat";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {
  getAllRoutes,
  loadReserves,
  MULTI_SWAP2_MATIC,
  CONTRACT_UTILS_MATIC,
  findBestRoutes,
  RoutesData,
  encodeRouteData,
  saveObjectToJsonFile
} from "../../scripts/multiswap/MultiSwapLibrary";
import pairsJson from '../../scripts/multiswap/json/MultiSwapPairs.json'
import {TokenUtils} from "../TokenUtils";
import {/*BigNumber,*/ utils} from "ethers";

import savedRoutesData from './json/USDC_TETU.json';

const encodedRouteDataFileName = 'test/multiswap/json/USDC_TETU.json';
const pairs = pairsJson as string[][]

// const {expect} = chai;
chai.use(chaiAsPromised);


describe("MultiSwap2 base tests", function () {

  let signer: SignerWithAddress;
  let multiSwap2: MultiSwap2;
  let contractUtils: ContractUtils;
  let usdc: string;

  before(async function () {
    signer = (await ethers.getSigners())[0];
    console.log('network.name', network.name);

    usdc = await DeployerUtils.getUSDCAddress();

    if (network.name === 'matic') {

      multiSwap2 = await DeployerUtils.connectInterface(
          signer, "MultiSwap2", MULTI_SWAP2_MATIC
      ) as MultiSwap2;
      contractUtils = await DeployerUtils.connectInterface(
          signer, "ContractUtils", CONTRACT_UTILS_MATIC
      ) as ContractUtils;

    } else if (network.name === 'hardhat') {

      multiSwap2 = await DeployerUtils.deployContract(signer, 'MultiSwap2',
          signer.address,
      ) as MultiSwap2;
      contractUtils = await DeployerUtils.deployContract(signer, 'ContractUtils',
      ) as ContractUtils;

      await TokenUtils.getToken(usdc, signer.address,
          utils.parseUnits('500000', 6));

    } else console.error('Unsupported network', network.name)

  })

  after(async function () {
  });

  it("generateWays & multiSwap", async () => {
    const tokenIn = usdc;
    const tokenOut = MaticAddresses.TETU_TOKEN;
    // const tokenOut = MaticAddresses.AAVE_TOKEN; // TODO check outputs
    const amount = ethers.utils.parseUnits('100000', 6);

    if (network.name === 'matic') {

      console.time('getAllRoutes')
      const allRoutes = getAllRoutes(pairs, tokenIn, tokenOut, 4);
      console.timeEnd('getAllRoutes')
      console.log('allRoutes.length', allRoutes.length);

      console.time('loadReserves')
      await loadReserves(contractUtils, allRoutes)
      console.timeEnd('loadReserves')

      const routesData = findBestRoutes(allRoutes, amount)
      console.log('routesData', routesData);

      await saveObjectToJsonFile(routesData, encodedRouteDataFileName)
      console.log('+++ Route data saved to ', encodedRouteDataFileName);

    } else {

      console.log('savedRoutesData', savedRoutesData);
      const routesData = savedRoutesData as unknown as RoutesData
      const encodedRoutesData = encodeRouteData(routesData);
      console.log('encodedRoutesData', encodedRoutesData);

      await TokenUtils.approve(tokenIn, signer, multiSwap2.address, amount.toString())
      const slippage = 10; // 1%
      await multiSwap2.multiSwap(tokenIn, tokenOut, amount,  slippage, encodedRoutesData);
    }


  })

  it.only("should be able to buy all assets", async () => {

    const entries = Object.entries(MaticAddresses);
    const tokens = entries.filter(key => key[0].endsWith('_TOKEN'));

    for (const token of tokens) {
      console.log(token[0], token[1]);
      // TODO call test swap from USDC to token[1]
    }

  });


})
