import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {
  ContractReader,
  StrategyAaveMaiBal,
  StrategyAaveMaiBal__factory
} from "../../../../typechain";
import {appendFileSync, mkdir} from "fs";
import {infos} from "./MultiAMBInfos";
import {MultiPipeDeployer} from "./MultiPipeDeployer";
import {RunHelper} from "../../../utils/tools/RunHelper";


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

  for (let i = 5; i < infos.length; i++) {
    const info = infos[i];
    const vaultNameWithoutPrefix = `MULTI_${info.underlyingName}`;
    const vaultAddress = vaultMap.get('TETU_' + vaultNameWithoutPrefix)

    if (!vaultAddress) {
      console.error('Strategy not exist!!!', vaultNameWithoutPrefix);
      return;
    }


    console.log('strat', info.underlyingName);

    const pipes: string[] = [];

    const aaveAmPipeData = await MultiPipeDeployer.deployAaveAmPipe(
      signer,
      info.underlying,
      info.amToken
    );
    pipes.push(aaveAmPipeData.address);
    // -----------------
    const maiCamPipeData = await MultiPipeDeployer.deployMaiCamPipe(
      signer,
      info.amToken,
      info.camToken
    );
    pipes.push(maiCamPipeData.address);
    // -----------------
    const maiStablecoinPipeData = await MultiPipeDeployer.deployMaiStablecoinPipe(
      signer,
      info.camToken,
      info.stablecoin,
      info.targetPercentage,
      info.collateralNumerator || '1'
    );
    pipes.push(maiStablecoinPipeData.address);
    // -----------------
    const balVaultPipeData = await MultiPipeDeployer.deployBalVaultPipe(
      signer
    );
    pipes.push(balVaultPipeData.address);
    // -----------------

    await DeployerUtils.wait(5);

    const strategyData = await DeployerUtils.deployTetuProxyControlled(
      signer,
      strategyContractName
    );
    await RunHelper.runAndWait(() => StrategyAaveMaiBal__factory.connect(strategyData[0].address, signer).initialize(
      core.controller,
      vaultAddress,
      info.underlying,
      pipes,
      {gasLimit: 12_000_000}
    ));

    const txt = `${vaultNameWithoutPrefix}:     vault: ${vaultAddress}     strategy: ${strategyData[0].address}\n`;
    appendFileSync(`./tmp/update/multiAMB_v2.txt`, txt, 'utf8');

    return;
    // await DeployerUtils.wait(5);
    // // tslint:disable-next-line:prefer-for-of
    // for (let i = 0; i < pipes.length; i++) {
    //   const pipeAdr = pipes[i];
    //   await DeployerUtils.verify(pipeAdr);
    // }
    //
    // await DeployerUtils.verifyWithContractName(strategyData[0].address, 'contracts/strategies/matic/multi/StrategyAaveMaiBal.sol:StrategyAaveMaiBal');


    console.log('----------------------------------------------- DEPLOYED', vaultNameWithoutPrefix);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
