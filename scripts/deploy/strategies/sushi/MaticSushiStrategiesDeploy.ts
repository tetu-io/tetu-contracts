import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {Controller, IStrategy} from "../../../../typechain";
import {readFileSync} from "fs";
import {MaticAddresses} from "../../../../test/MaticAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const controller = await DeployerUtils.connectContract(signer, "Controller", core.controller) as Controller;

  const infos = readFileSync('scripts/utils/generate/sushi/sushi_pools.csv', 'utf8').split(/\r?\n/);

  const deployed = [];

  for (let info of infos) {
    const strat = info.split(',');

    const idx = strat[0];
    const lp_name = strat[1];
    const lp_address = strat[2];
    const token0 = strat[3];
    const token0_name = strat[4];
    const token1 = strat[5];
    const token1_name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === 'idx') {
      console.log('skip', idx);
      return;
    }

    console.log('strat', idx, lp_name);

    const data = await DeployerUtils.deployAndInitVaultAndStrategy(
        `SUSHI_${token0_name}_${token1_name}`,
        vaultAddress => DeployerUtils.deployContract(
            signer,
            'StrategySushiSwapLp',
            core.controller,
            vaultAddress,
            lp_address,
            token0,
            token1,
            idx
        ) as Promise<IStrategy>,
        controller,
        core.psVault,
        signer,
        60 * 60 * 24 * 28,
        true
    );
    data.push([
      core.controller,
      data[1].address,
      lp_address,
      token0,
      token1,
      idx
    ]);
    deployed.push(data);
  }

  await DeployerUtils.wait(5);

  for (let data of deployed) {
    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);
    await DeployerUtils.verifyWithArgs(data[2].address, data[3]);

  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
