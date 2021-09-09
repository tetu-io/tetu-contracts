import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {
  IIronLpToken,
  IIronSwap,
  IronControllerInterface,
  IUniswapV2Pair,
  PriceCalculator,
  RErc20Storage,
  RTokenInterface
} from "../../../typechain";
import {Erc20Utils} from "../../../test/Erc20Utils";
import {mkdir, writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const controller = await DeployerUtils.connectInterface(signer, 'IronControllerInterface', MaticAddresses.IRON_CONTROLLER) as IronControllerInterface;
  const priceCalculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;

  const markets = await controller.getAllMarkets();
  console.log('markets', markets.length);

  // const vaultInfos = await VaultUtils.getVaultInfoFromServer();
  // const underlyingStatuses = new Map<string, boolean>();
  // const currentRewards = new Map<string, number>();
  // const underlyingToVault = new Map<string, string>();
  // for (let vInfo of vaultInfos) {
  //   underlyingStatuses.set(vInfo.underlying.toLowerCase(), vInfo.active);
  //   underlyingToVault.set(vInfo.underlying.toLowerCase(), vInfo.addr);
  //   if (vInfo.active) {
  //     const vctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vInfo.addr) as SmartVault;
  //     currentRewards.set(vInfo.underlying.toLowerCase(), await VaultUtils.vaultRewardsAmount(vctr, core.psVault));
  //   }
  // }


  const rewardPrice = await priceCalculator.getPriceWithDefaultOutput(MaticAddresses.ICE_TOKEN);
  console.log('reward price', utils.formatUnits(rewardPrice));

  let infos: string = 'idx, rToken_name, rToken_address, token, tokenName, collateralFactor, borrowTarget \n';
  for (let i = 0; i < markets.length; i++) {
    console.log('id', i);

    if (i === 2) {
      console.log('skip matic temporally')
      continue;
    }

    const rTokenAdr = markets[i];
    const rTokenName = await Erc20Utils.tokenSymbol(rTokenAdr);
    console.log('rTokenName', rTokenName, rTokenAdr)
    const rTokenCtr = await DeployerUtils.connectInterface(signer, 'RTokenInterface', rTokenAdr) as RTokenInterface;
    const rTokenCtr2 = await DeployerUtils.connectInterface(signer, 'RErc20Storage', rTokenAdr) as RErc20Storage;
    const token = await rTokenCtr2.underlying();
    const tokenName = await Erc20Utils.tokenSymbol(token);

    const collateralFactor = +utils.formatUnits((await controller.markets(rTokenAdr)).collateralFactorMantissa) * 10000;
    const borrowTarget = Math.floor(collateralFactor * 0.9);

    const data = i + ',' +
        rTokenName + ',' +
        rTokenAdr + ',' +
        token + ',' +
        tokenName + ',' +
        Math.floor(collateralFactor * 0.99) + ',' +
        borrowTarget

    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  await writeFileSync('./tmp/iron_markets.csv', infos, 'utf8');
  console.log('done');
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

async function collectTokensInfo(signer: SignerWithAddress, lp: string, id: number): Promise<string[]> {
  if (id === 0 || id === 3) {
    return await collectTokensInfoIronSwap(signer, lp);
  } else {
    return await collectTokensInfoUniswap(signer, lp);
  }
}

async function collectTokensInfoIronSwap(signer: SignerWithAddress, lp: string): Promise<string[]> {
  const lpContract = await DeployerUtils.connectInterface(signer, 'IIronLpToken', lp) as IIronLpToken;
  const swapAddress = await lpContract.swap();
  const swapContract = await DeployerUtils.connectInterface(signer, 'IIronSwap', swapAddress) as IIronSwap;
  return await swapContract.getTokens();
}

async function collectTokensInfoUniswap(signer: SignerWithAddress, lp: string): Promise<string[]> {
  try {
    const lpContract = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
    const tokens = [];

    tokens.push(await lpContract.token0());
    tokens.push(await lpContract.token1());

    return tokens;
  } catch (e) {
    console.error('error collect tokens from ', lp);
  }
  return [];
}

function computeWeekReward(
    time: number,
    sushiPerSecond: BigNumber,
    allocPoint: BigNumber,
    totalAllocPoint: BigNumber,
    sushiPrice: BigNumber
): number {
  const sushiReward = BigNumber.from(time).mul(sushiPerSecond).mul(allocPoint).div(totalAllocPoint);
  const timeWeekRate = (60 * 60 * 24 * 7) / time;
  const sushiRewardForWeek = +utils.formatUnits(sushiReward) * timeWeekRate;
  return +utils.formatUnits(sushiPrice) * sushiRewardForWeek;
}
