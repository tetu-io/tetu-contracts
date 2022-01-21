import { ethers } from "hardhat";
import { DeployerUtils } from "../../DeployerUtils";
import { ContractReader, IStrategy } from "../../../../typechain";
import { appendFileSync, mkdir, readFileSync } from "fs";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync(
    "scripts/utils/download/data/spooky_pools.csv",
    "utf8"
  ).split(/\r?\n/);

  const deployed = [];
  const vaultNames = new Set<string>();

  const cReader = (await DeployerUtils.connectContract(
    signer,
    "ContractReader",
    tools.reader
  )) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log("all vaults size", deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    vaultNames.add(await cReader.vaultName(vAdr));
  }

  mkdir("./tmp/deployed", { recursive: true }, (err) => {
    if (err) throw err;
  });

  for (const info of infos) {
    const strat = info.split(",");

    const idx = strat[0];
    const lpAame = strat[1];
    const lpAddress = strat[2];
    const token0 = strat[3];
    const token0Name = strat[4];
    const token1 = strat[5];
    const token1Name = strat[6];
    const alloc = strat[7];

    if (+alloc <= 0 || idx === "idx" || !idx) {
      console.log("skip", idx);
      continue;
    }

    const vaultNameWithoutPrefix = `SPOOKY_${token0Name}_${token1Name}`;

    if (vaultNames.has("TETU_" + vaultNameWithoutPrefix)) {
      console.log("Strategy already exist", vaultNameWithoutPrefix);
      continue;
    }

    console.log("strat", idx, lpAame);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = [];
    data.push(
      ...(await DeployerUtils.deployVaultAndStrategy(
        vaultNameWithoutPrefix,
        async (vaultAddress) =>
          DeployerUtils.deployContract(
            signer,
            "StrategySpookySwapLp",
            core.controller,
            vaultAddress,
            lpAddress,
            token0,
            token1,
            idx
          ) as Promise<IStrategy>,
        core.controller,
        core.psVault,
        signer,
        60 * 60 * 24 * 28,
        true
      ))
    );
    data.push([
      core.controller,
      data[1].address,
      lpAddress,
      token0,
      token1,
      idx,
    ]);
    deployed.push(data);

    const txt = `${vaultNameWithoutPrefix}:     vault: ${data[1].address}     strategy: ${data[2].address}\n`;
    appendFileSync(`./tmp/deployed/vaults.txt`, txt, "utf8");
  }

  await DeployerUtils.wait(5);

  for (const data of deployed) {
    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);
    await DeployerUtils.verifyWithContractName(
      data[2].address,
      "contracts/strategies/fantom/spooky/StrategySpookySwapLp.sol:StrategySpookySwapLp",
      data[3]
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
