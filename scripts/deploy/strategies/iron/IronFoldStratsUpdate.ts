import { ethers } from "hardhat";
import { DeployerUtils } from "../../DeployerUtils";
import {
  ContractReader,
  IStrategy,
  StrategyIronFold,
} from "../../../../typechain";
import { readFileSync } from "fs";

const needToDeploy = new Set<string>(["2"]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const infos = readFileSync(
    "scripts/utils/download/data/iron_markets.csv",
    "utf8"
  ).split(/\r?\n/);

  const cReader = (await DeployerUtils.connectContract(
    signer,
    "ContractReader",
    tools.reader
  )) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log("all vaults size", deployedVaultAddresses.length);

  const vaultsMap = new Map<string, string>();
  for (const vAdr of deployedVaultAddresses) {
    vaultsMap.set(await cReader.vaultName(vAdr), vAdr);
  }

  // *********** DEPLOY
  for (const info of infos) {
    const strat = info.split(",");

    const idx = strat[0];
    const rTokenName = strat[1];
    const rTokenAddress = strat[2];
    const token = strat[3];
    const tokenName = strat[4];
    const collateralFactor = strat[5];
    const borrowTarget = strat[6];

    if (idx === "idx" || !token) {
      console.log("skip", idx);
      continue;
    }

    if (!needToDeploy.has(idx)) {
      console.log("skip", idx);
      continue;
    }

    const vaultNameWithoutPrefix = `IRON_LOAN_${tokenName}`;

    const vAdr = vaultsMap.get("TETU_" + vaultNameWithoutPrefix);

    if (!vAdr) {
      console.log("Vault not found!", vaultNameWithoutPrefix);
      return;
    }

    console.log("strat", idx, rTokenName, vaultNameWithoutPrefix, vAdr);

    const strategy = (await DeployerUtils.deployContract(
      signer,
      "StrategyIronFold",
      core.controller,
      vAdr,
      token,
      rTokenAddress,
      borrowTarget,
      collateralFactor
    )) as IStrategy;

    if ((await ethers.provider.getNetwork()).name !== "hardhat") {
      await DeployerUtils.wait(5);
      await DeployerUtils.verifyWithContractName(
        strategy.address,
        "contracts/strategies/matic/iron/StrategyIronFold.sol:StrategyIronFold",
        [
          core.controller,
          vAdr,
          token,
          rTokenAddress,
          borrowTarget,
          collateralFactor,
        ]
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
