import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {ContractReader, IStrategy} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {infos} from "./MultiAMBInfos";
import {AMBPipeDeployer} from "./AMBPipeDeployer";


async function main() {
  const strategyContractName = 'StrategyAaveMaiBal';

  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const deployed = [];
  const vaultMap = new Map<string, string>();

  const cReader = await DeployerUtils.connectContract(signer, "ContractReader", tools.reader) as ContractReader;

  const deployedVaultAddresses = await cReader.vaults();
  console.log('all vaults size', deployedVaultAddresses.length);

  for (const vAdr of deployedVaultAddresses) {
    const name = await cReader.vaultName(vAdr)
    vaultMap.set(name, vAdr);
    // console.log('name', name);
  }

  mkdir('./tmp/update', {recursive: true}, (err) => {
    if (err) throw err;
  });

  for (const info of infos) {

    const vaultNameWithoutPrefix = `MULTI_${info.underlyingName}`;
    const vaultAddress = vaultMap.get('TETU_' + vaultNameWithoutPrefix)

    if (!vaultAddress) {
      console.error('Strategy not exist!!!', vaultNameWithoutPrefix);
      return;
    }


    console.log('strat', info.underlyingName);

    const pipes: string[] = [];
    // tslint:disable-next-line
    const pipesArgs: any[][] = [];

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
    const maiStablecoinPipeData = await AMBPipeDeployer.deployMaiStablecoinPipe(
      signer,
      info.camToken,
      info.stablecoin,
      info.amToken,
      info.targetPercentage,
      info.collateralNumerator || '1'
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

    const strategyArgs = [
      core.controller,
      vaultAddress,
      info.underlying,
      pipes
    ];

    const strategy = await DeployerUtils.deployContract(
      signer,
      strategyContractName,
      ...strategyArgs
    ) as IStrategy;


    const txt = `${vaultNameWithoutPrefix}:     vault: ${vaultAddress}     strategy: ${strategy.address}\n`;
    appendFileSync(`./tmp/update/multiAMB_120.txt`, txt, 'utf8');

    await DeployerUtils.wait(5);
    for (let i = 0; i < pipes.length; i++) {
      const pipeAdr = pipes[i];
      const pipeArg = pipesArgs[i];
      await DeployerUtils.verifyWithArgs(pipeAdr, [pipeArg]);
    }

    await DeployerUtils.verifyWithContractName(strategy.address, 'contracts/strategies/matic/multi/StrategyAaveMaiBal.sol:StrategyAaveMaiBal', strategyArgs);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
