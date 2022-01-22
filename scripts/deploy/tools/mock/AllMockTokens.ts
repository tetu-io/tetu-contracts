import { DeployerUtils } from '../../DeployerUtils';
import { ethers } from 'hardhat';
import {
  MockQUICK,
  MockSUSHI,
  MockUSDC,
  MockWETH,
} from '../../../../typechain';
import { utils } from 'ethers';
import { writeFileSync } from 'fs';

async function main() {
  const signer = (await ethers.getSigners())[0];

  const quick = (await DeployerUtils.deployContract(
    signer,
    'MockQUICK',
  )) as MockQUICK;
  await quick.mint(signer.address, utils.parseUnits('10000000'));

  const sushi = (await DeployerUtils.deployContract(
    signer,
    'MockSUSHI',
  )) as MockSUSHI;
  await sushi.mint(signer.address, utils.parseUnits('10000000'));

  const usdc = (await DeployerUtils.deployContract(
    signer,
    'MockUSDC',
  )) as MockUSDC;
  await usdc.mint(signer.address, utils.parseUnits('10000000', 6));

  const weth = (await DeployerUtils.deployContract(
    signer,
    'MockWETH',
  )) as MockWETH;
  await weth.mint(signer.address, utils.parseUnits('10000000'));

  writeFileSync(
    './token_addresses.txt',
    quick.address +
      ', // quick\n' +
      sushi.address +
      ', // sushi\n' +
      usdc.address +
      ', // usdc\n' +
      weth.address +
      ', // weth\n',
    'utf8',
  );

  await DeployerUtils.wait(5);

  await DeployerUtils.verifyWithContractName(
    quick.address,
    'contracts/test/MockQUICK.sol:MockQUICK',
  );
  await DeployerUtils.verifyWithContractName(
    sushi.address,
    'contracts/test/MockSUSHI.sol:MockSUSHI',
  );
  await DeployerUtils.verifyWithContractName(
    usdc.address,
    'contracts/test/MockUSDC.sol:MockUSDC',
  );
  await DeployerUtils.verifyWithContractName(
    weth.address,
    'contracts/test/MockWETH.sol:MockWETH',
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
