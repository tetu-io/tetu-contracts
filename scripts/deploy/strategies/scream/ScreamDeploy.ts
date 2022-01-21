import { ethers } from "hardhat";
import { DeployerUtils } from "../../DeployerUtils";
import { ContractReader, IStrategy } from "../../../../typechain";
import { appendFileSync, mkdir, readFileSync } from "fs";

const alreadyDeployed = new Set<string>([]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  mkdir("./tmp/deployed", { recursive: true }, (err) => {
    if (err) throw err;
  });

  const infos = readFileSync(
    "scripts/utils/download/data/scream_markets.csv",
    "utf8"
  ).split(/\r?\n/);

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

  // *********** DEPLOY VAULT
  for (const info of infos) {
    const strat = info.split(",");

    const idx = strat[0];
    const scTokenName = strat[1];
    const scTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];
    const tvl = strat[7];

    if (idx === "idx" || !token) {
      console.log("skip", idx);
      continue;
    }

    if (alreadyDeployed.has(idx)) {
      console.log("Strategy already deployed", idx);
      continue;
    }

    const vaultNameWithoutPrefix = `${tokenName}`;

    if (vaultNames.has("TETU_" + vaultNameWithoutPrefix)) {
      console.log("Strategy already exist", vaultNameWithoutPrefix);
      continue;
    }

    console.log("strat", idx, scTokenName, vaultNameWithoutPrefix);

    let strategyArgs;

    const data = await DeployerUtils.deployVaultAndStrategy(
      vaultNameWithoutPrefix,
      async (vaultAddress) => {
        strategyArgs = [
          core.controller,
          vaultAddress,
          token,
          scTokenAddress,
          borrowTarget,
          collateralFactor,
        ];
        return DeployerUtils.deployContract(
          signer,
          "StrategyScreamFold",
          ...strategyArgs
        ) as Promise<IStrategy>;
      },
      core.controller,
      core.rewardToken,
      signer,
      60 * 60 * 24 * 28,
      0,
      true
    );

    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);
    await DeployerUtils.wait(5);
    await DeployerUtils.verifyWithContractName(
      data[2].address,
      "contracts/strategies/fantom/scream/StrategyScreamFold.sol:StrategyScreamFold",
      strategyArgs
    );

    const txt = `${vaultNameWithoutPrefix} vault: ${data[1].address} strategy: ${data[2].address}\n`;
    appendFileSync(`./tmp/deployed/SCREAM.txt`, txt, "utf8");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
