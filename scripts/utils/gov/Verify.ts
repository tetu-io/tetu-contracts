import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ethers} from "hardhat";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const adrs = [
    "0x11253fF148902A837A6f5c7Cd113d46B58A5CeA5",
  ]

  for (const adr of adrs) {
    await DeployerUtils.verifyWithArgs(adr, [
      core.controller,
      '0x715aC7649612ecBbf3AdE416b4fd56698291820b',
      '0x7AfC060acCA7ec6985d982dD85cC62B111CAc7a7',
      '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      '0x42d61D766B85431666B39B89C43011f24451bFf6',
      '0x64D2B3994F64E3E82E48CC92e1122489e88e8727',
      ['0x831753DD7087CaC61aB5644b308642cc1c33Dc13', '0x42d61D766B85431666B39B89C43011f24451bFf6']
    ]);

  }


}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
