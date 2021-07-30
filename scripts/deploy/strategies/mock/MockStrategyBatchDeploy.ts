import {ethers} from "hardhat";
import {DeployerUtils} from "../../DeployerUtils";
import {
  Controller,
  ERC20PresetMinterPauser,
  IStrategy,
  IUniswapV2Factory,
  SmartVault
} from "../../../../typechain";
import {utils} from "ethers";
import {Erc20Utils} from "../../../../test/Erc20Utils";
import {RunHelper} from "../../../utils/RunHelper";
import {Settings} from "../../../../settings";
import {RopstenAddresses} from "../../../../test/RopstenAddresses";


async function main() {
  const VERSION = Settings.mockBatchDeployVersion;
  const signer = (await ethers.getSigners())[0];
  const net = (await ethers.provider.getNetwork()).name;
  const core = await DeployerUtils.getCoreAddresses();
  const mocks = await DeployerUtils.getTokenAddresses();
  const platform = 3; // sushi

  const poolReward = mocks.get('quick') as string;
  const poolRewardAmountN = '10000';
  const vaultSecondReward = mocks.get('weth') as string
  const vaultSecondRewardAmountN = '35000';
  const vaultThirdReward = mocks.get('usdc') as string
  const vaultThirdRewardAmountN = '99123';

  const datas = [];
  const datasPools = [];
  const controller = await DeployerUtils.connectContract(
      signer, 'Controller', core.controller) as Controller;

  const possibleTokens = [
    mocks.get('quick') as string,
    mocks.get('sushi') as string,
    mocks.get('usdc') as string,
    mocks.get('weth') as string,
    core.rewardToken
  ];

  const strategyName = 'MockStrategySelfFarm';

  const underlyingByIdx = new Map<number, string[]>();

  const sushiFactory = await DeployerUtils.connectInterface(signer, 'IUniswapV2Factory', RopstenAddresses.SUSHI_FACTORY) as IUniswapV2Factory;

  for (let i = 0; i < Settings.mockBatchDeployCount; i++) {
    const t1Rand = Math.floor(Math.random() * (possibleTokens.length - 1));
    let t2Rand = t1Rand + 1;
    if (t2Rand > possibleTokens.length - 1) {
      t2Rand = 0;
    }

    const underlying0 = possibleTokens[t1Rand];
    const underlying1 = possibleTokens[t2Rand];
    console.log('underlying0', underlying0, t1Rand);
    console.log('underlying1', underlying1, t2Rand);

    const underlying = await sushiFactory.getPair(underlying0, underlying1);
    if (!underlying) {
      throw Error('not found pair');
    }

    underlyingByIdx.set(i, [underlying0, underlying1, underlying]);

    const undName0 = await Erc20Utils.tokenSymbol(underlying0);
    const undName1 = await Erc20Utils.tokenSymbol(underlying1);
    const vaultName: string = `MOCK_SUSHI_${undName0}_${undName1}_V${VERSION}_${i}`;
    const poolName: string = `NOOP_SUSHI_${undName0}_${undName1}_V${VERSION}_${i}`;
    const vaultRewardToken: string = core.psVault;
    const rewardDuration: number = 60 * 60 * 24 * 28; // 1 week
    // *********** DEPLOY MOCK POOL FOR STRATEGY
    const poolLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const poolProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", poolLogic.address);
    const pool = poolLogic.attach(poolProxy.address) as SmartVault;

    const noopStrategy = await DeployerUtils.deployContract(signer, 'NoopStrategy',
        controller.address, underlying, pool.address, [], [underlying0, underlying1]) as IStrategy;

    const noopStrategyUnderlying = await noopStrategy.underlying();

    await RunHelper.runAndWait(() => pool.initializeSmartVault(
        "V_" + poolName,
        "x" + poolName,
        controller.address,
        noopStrategyUnderlying,
        rewardDuration
    ));


    await RunHelper.runAndWait(() => pool.addRewardToken(poolReward));
    const poolRewardDecimals = await Erc20Utils.decimals(poolReward);

    const mockContract = await DeployerUtils.connectContract(signer, "ERC20PresetMinterPauser", poolReward) as ERC20PresetMinterPauser;
    await RunHelper.runAndWait(() => mockContract.mint(signer.address, utils.parseUnits(poolRewardAmountN, poolRewardDecimals)));
    await RunHelper.runAndWait(() => Erc20Utils.approve(poolReward, signer, pool.address, utils.parseUnits(poolRewardAmountN, poolRewardDecimals).toString()));
    await RunHelper.runAndWait(() => pool.notifyTargetRewardAmount(poolReward, utils.parseUnits(poolRewardAmountN, poolRewardDecimals)));

    await RunHelper.runAndWait(() => controller.addVaultAndStrategy(pool.address, noopStrategy.address));

    datasPools.push([poolLogic, pool, noopStrategy]);

    // *********** DEPLOY VAULT
    const vaultLogic = await DeployerUtils.deployContract(signer, "SmartVault");
    const vaultProxy = await DeployerUtils.deployContract(signer, "TetuProxyControlled", vaultLogic.address);
    const vault = vaultLogic.attach(vaultProxy.address) as SmartVault;

    const strategy = await DeployerUtils.deployContract(signer, strategyName,
        controller.address, vault.address, pool.address, underlying, [underlying0, underlying1], platform, [poolReward]) as IStrategy;

    const strategyUnderlying = await strategy.underlying();

    await RunHelper.runAndWait(() => vault.initializeSmartVault(
        "V_" + vaultName,
        "x" + vaultName,
        controller.address,
        strategyUnderlying,
        rewardDuration
    ));
    await RunHelper.runAndWait(() => vault.addRewardToken(vaultRewardToken));
    await RunHelper.runAndWait(() => vault.addRewardToken(vaultSecondReward));
    await RunHelper.runAndWait(() => vault.addRewardToken(vaultThirdReward));

    await RunHelper.runAndWait(() =>
        controller.addVaultAndStrategy(vault.address, strategy.address));

    const vaultSecondRewardDec = await Erc20Utils.decimals(vaultSecondReward);
    const mockContract2 = await DeployerUtils.connectContract(signer, "ERC20PresetMinterPauser", vaultSecondReward) as ERC20PresetMinterPauser;
    await RunHelper.runAndWait(() => mockContract2.mint(signer.address, utils.parseUnits(vaultSecondRewardAmountN, vaultSecondRewardDec)));
    await RunHelper.runAndWait(() => Erc20Utils.approve(vaultSecondReward, signer, vault.address, utils.parseUnits(vaultSecondRewardAmountN, vaultSecondRewardDec).toString()));
    await RunHelper.runAndWait(() => vault.notifyTargetRewardAmount(vaultSecondReward, utils.parseUnits(vaultSecondRewardAmountN, vaultSecondRewardDec)));

    const vaultThirdRewardDec = await Erc20Utils.decimals(vaultThirdReward);
    const mockContract3 = await DeployerUtils.connectContract(signer, "ERC20PresetMinterPauser", vaultThirdReward) as ERC20PresetMinterPauser;
    await RunHelper.runAndWait(() => mockContract3.mint(signer.address, utils.parseUnits(vaultThirdRewardAmountN, vaultThirdRewardDec)));
    await RunHelper.runAndWait(() => Erc20Utils.approve(vaultThirdReward, signer, vault.address, utils.parseUnits(vaultThirdRewardAmountN, vaultThirdRewardDec).toString()));
    await RunHelper.runAndWait(() => vault.notifyTargetRewardAmount(vaultThirdReward, utils.parseUnits(vaultThirdRewardAmountN, vaultThirdRewardDec)));

    datas.push([vaultLogic, vault, strategy, pool]);
  }

  await DeployerUtils.wait(5);

  for (let i = 0; i < Settings.mockBatchDeployCount; i++) {
    const undrData = underlyingByIdx.get(i) as string[];
    const data = datas[i];
    const vaultLogic = data[0];
    const vaultProxy = data[1];
    const strategy = data[2];
    const pool = data[3];

    await DeployerUtils.verify(vaultLogic.address);
    await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
    await DeployerUtils.verifyProxy(vaultProxy.address);
    await DeployerUtils.verifyWithArgs(strategy.address,
        [controller.address, vaultProxy.address, pool.address, undrData[2],
          [undrData[0], undrData[1]],
          platform, [poolReward]]);
  }

  for (let i = 0; i < Settings.mockBatchDeployCount; i++) {
    const undrData = underlyingByIdx.get(i) as string[];
    const data = datasPools[i];
    const vaultLogic = data[0];
    const vaultProxy = data[1];
    const strategy = data[2];

    await DeployerUtils.verify(vaultLogic.address);
    await DeployerUtils.verifyWithArgs(vaultProxy.address, [vaultLogic.address]);
    await DeployerUtils.verifyProxy(vaultProxy.address);
    await DeployerUtils.verifyWithArgs(strategy.address,
        [controller.address, undrData[2], vaultProxy.address, [],
          [undrData[0], undrData[1]]
        ]);
  }


}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
