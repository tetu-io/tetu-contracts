import {DeployerUtils} from "../DeployerUtils";
import {ethers} from "hardhat";
import {ContractReader, ContractUtils, PriceCalculator, TetuProxyGov} from "../../../typechain";
import {writeFileSync} from "fs";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const net = await ethers.provider.getNetwork();

  let calculatorData: [PriceCalculator, TetuProxyGov, PriceCalculator];
  if (net.name === "matic") {
    // @ts-ignore
    calculatorData = await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller);
  } else {
    // @ts-ignore
    calculatorData = await DeployerUtils.deployPriceCalculatorTestNet(signer, core.controller);
  }

  const readerLogic = await DeployerUtils.deployContract(signer, "ContractReader");
  const readerProxy = await DeployerUtils.deployContract(signer, "TetuProxyGov", readerLogic.address);
  const contractReader = readerLogic.attach(readerProxy.address) as ContractReader;

  await contractReader.initialize(core.controller);
  await contractReader.setPriceCalculator(calculatorData[0].address);

  const balancer = await DeployerUtils.deployContract(signer, "LiquidityBalancer", core.controller);

  const utils = await DeployerUtils.deployContract(signer, "ContractUtils") as ContractUtils;

  await writeFileSync('./tool_addresses.txt',
      calculatorData[0].address + ', // calculator\n' +
      contractReader.address + ', // contractReader\n' +
      utils.address + ', // utils\n' +
      balancer.address + ', // balancer\n'
      , 'utf8');

  await DeployerUtils.wait(5);

  await DeployerUtils.verify(calculatorData[2].address);
  await DeployerUtils.verifyWithArgs(calculatorData[1].address, [calculatorData[2].address]);
  await DeployerUtils.verifyProxy(calculatorData[1].address);

  await DeployerUtils.verify(readerLogic.address);
  await DeployerUtils.verifyWithArgs(readerProxy.address, [readerLogic.address]);
  await DeployerUtils.verifyProxy(readerProxy.address);

  await DeployerUtils.verifyWithArgs(balancer.address, [core.controller]);

  await DeployerUtils.verify(utils.address);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
