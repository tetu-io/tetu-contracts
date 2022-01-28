import {ethers, network} from "hardhat";
import {DeployerUtils} from "../DeployerUtils";
import {GelatoAMBRebalancer} from "../../../typechain";

// Latest: 0x9DC8D0c2A0606D693399bb60DB79718bBdbD393B

// https://docs.gelato.network/resources/contract-addresses
const GELATO_POKE_ME_MATIC  = '0x527a819db1eb0e34426297b03bae11F2f8B3A19E'
const GELATO_POKE_ME_FANTOM = '0x6EDe1597c05A0ca77031cBA43Ab887ccf24cd7e8'

const pokeMe: {[network:string]: string} = {
  matic:  GELATO_POKE_ME_MATIC,
  fantom: GELATO_POKE_ME_FANTOM
}

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  console.log('network.name', network.name);
  const pokeMeAddress = pokeMe[network.name]
  console.log('pokeMeAddress', pokeMeAddress);
  if (!pokeMeAddress) console.error('Unsupported network')

  const contract = await DeployerUtils.deployContract(
      signer,
      "GelatoAMBRebalancer",
      pokeMeAddress) as GelatoAMBRebalancer;

  await DeployerUtils.wait(5);
  await DeployerUtils.verifyWithArgs(contract.address, [pokeMeAddress]);
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
