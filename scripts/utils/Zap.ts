import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {PriceCalculator} from "../../typechain";
import {MaticAddresses} from "../../test/MaticAddresses";
import {Erc20Utils} from "../../test/Erc20Utils";


async function main() {
  const signer = (await ethers.getSigners())[1];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  // const bookkeeper = await DeployerUtils.connectInterface(signer, 'Bookkeeper', core.bookkeeper) as Bookkeeper;
  // const cReader = await DeployerUtils.connectContract(
  //     signer, "ContractReader", tools.reader) as ContractReader;
  const priceCalculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;


  await findRoutes(MaticAddresses.USDC_TOKEN, MaticAddresses.QI_TOKEN, priceCalculator);
}


main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});


async function findRoutes(tokenIn: string, tokenOut: string, priceCalculator: PriceCalculator) {

  const usedLp: string[] = [];

  const route = [];

  let tokenOpposite = tokenOut;
  for (let i = 0; i < 1000; i++) {
    const data = await priceCalculator.getLargestPool(tokenOpposite, usedLp);

    const largestKeyName = await Erc20Utils.tokenSymbol(data[0]);
    console.log('data', largestKeyName, data[1].toNumber(), data[2]);
    usedLp.push(data[2]);
    if (data[0].toLowerCase() === tokenIn.toLowerCase()) {
      console.log('found!', usedLp);
      break;
    }
    tokenOpposite = data[0];
  }

}
