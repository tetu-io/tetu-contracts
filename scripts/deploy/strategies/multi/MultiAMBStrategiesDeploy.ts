import { ethers } from "hardhat";
import { DeployerUtils } from "../../DeployerUtils";
import { ContractReader, IStrategy } from "../../../../typechain";
import { appendFileSync, mkdir } from "fs";
import { infos } from "./MultiAMBInfos";
import { AMBPipeDeployer } from "./AMBPipeDeployer";

async function main() {
  const strategyContractName = "StrategyAaveMaiBal";

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

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
    const name = await cReader.vaultName(vAdr);
    vaultNames.add(name);
    // console.log('name', name);
  }

  mkdir("./tmp/deployed", { recursive: true }, (err) => {
    if (err) throw err;
  });

  for (const info of infos) {
    const vaultNameWithoutPrefix = `MULTI_${info.underlyingName}`;

    if (vaultNames.has("TETU_" + vaultNameWithoutPrefix)) {
      console.error("Strategy already exist!!!", vaultNameWithoutPrefix);
      return;
    }

    console.log("strat", info.underlyingName);
    const pipes: string[] = [];
    // eslint-disable-next-line
    const pipesArgs: any[][] = [];
    let strategyArgs;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = [];
    data.push(
      ...(await DeployerUtils.deployVaultAndStrategy(
        vaultNameWithoutPrefix,
        async (vaultAddress) => {
          const aaveAmPipeData = await AMBPipeDeployer.deployAaveAmPipe(
            signer,
            info.underlying,
            info.amToken
          );
          pipes.push(aaveAmPipeData[0].address);
          pipesArgs.push(aaveAmPipeData[1]);
          // -----------------
          const maiCamPipeData = await AMBPipeDeployer.deployMaiCamPipe(
            signer,
            info.amToken,
            info.camToken
          );
          pipes.push(maiCamPipeData[0].address);
          pipesArgs.push(maiCamPipeData[1]);
          // -----------------
          const maiStablecoinPipeData =
            await AMBPipeDeployer.deployMaiStablecoinPipe(
              signer,
              info.camToken,
              info.stablecoin,
              info.amToken,
              info.targetPercentage,
              info.collateralNumerator || "1"
            );
          pipes.push(maiStablecoinPipeData[0].address);
          pipesArgs.push(maiStablecoinPipeData[1]);
          // -----------------
          const balVaultPipeData = await AMBPipeDeployer.deployBalVaultPipe(
            signer
          );
          pipes.push(balVaultPipeData[0].address);
          pipesArgs.push(balVaultPipeData[1]);
          // -----------------

          strategyArgs = [
            core.controller,
            vaultAddress,
            info.underlying,
            pipes,
          ];

          return DeployerUtils.deployContract(
            signer,
            strategyContractName,
            ...strategyArgs
          ) as Promise<IStrategy>;
        },
        core.controller,
        core.psVault,
        signer,
        60 * 60 * 24 * 28,
        30,
        true
      ))
    );
    data.push(strategyArgs);
    deployed.push(data);

    const txt = `${vaultNameWithoutPrefix}:     vault: ${data[1].address}     strategy: ${data[2].address}\n`;
    appendFileSync(`./tmp/deployed/multiAMB.txt`, txt, "utf8");

    await DeployerUtils.wait(5);
    for (let i = 0; i < pipes.length; i++) {
      const pipeAdr = pipes[i];
      const pipeArg = pipesArgs[i];
      await DeployerUtils.verifyWithArgs(pipeAdr, [pipeArg]);
    }
  }
  await DeployerUtils.wait(5);

  for (const data of deployed) {
    await DeployerUtils.verify(data[0].address);
    await DeployerUtils.verifyWithArgs(data[1].address, [data[0].address]);
    await DeployerUtils.verifyProxy(data[1].address);
    await DeployerUtils.verifyWithContractName(
      data[2].address,
      "contracts/strategies/matic/multi/StrategyAaveMaiBal.sol:StrategyAaveMaiBal",
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
