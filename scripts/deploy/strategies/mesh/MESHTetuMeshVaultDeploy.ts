import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {MaticAddresses} from "../../../addresses/MaticAddresses";
import {
    ICreatePool, IERC20,
} from "../../../../typechain";
import {BigNumber} from "ethers";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const meshLPFactoryAddress = "0x9F3044f7F9FC8bC9eD615d54845b4577B833282d";
  const meshLPFactory = await DeployerUtils.connectInterface(signer, "ICreatePool", meshLPFactoryAddress) as ICreatePool;
  const meshTokenAddress = MaticAddresses.MESH_TOKEN;
  const tetuMeshAddress = "0xDcB8F34a3ceb48782c9f3F98dF6C12119c8d168a";
  const meshToken = await DeployerUtils.connectInterface(signer, "contracts/openzeppelin/IERC20.sol:IERC20", meshTokenAddress) as IERC20;
  const tetuMeshToken = await DeployerUtils.connectInterface(signer, "contracts/openzeppelin/IERC20.sol:IERC20", tetuMeshAddress) as IERC20;

  const depositAmount = BigNumber.from('50').mul(10).pow(18);
  const allowance = BigNumber.from('5000').mul(10).pow(18);

  // await meshToken.approve(meshLPFactoryAddress, "6010000000000000000000");
  // await tetuMeshToken.approve(meshLPFactoryAddress, "6010000000000000000000");

  console.log(`signer ${signer.address}`)
  console.log(`Mesh bal: ${await meshToken.balanceOf(signer.address)}`)
  console.log(`Mesh allowance: ${await meshToken.allowance(signer.address, meshLPFactoryAddress)}`)

  console.log(`tetuMesh bal: ${await tetuMeshToken.balanceOf(signer.address)}`)
  console.log(`tetuMesh allowance: ${await tetuMeshToken.allowance(signer.address, meshLPFactoryAddress)}`)



  await meshLPFactory.createTokenPool(
      meshTokenAddress,
      "50000000000000000000",
      tetuMeshAddress,
      "50000000000000000000",
      10,
  );
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });