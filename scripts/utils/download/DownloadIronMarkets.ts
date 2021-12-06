import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../addresses/MaticAddresses";
import {
  IIronLpToken,
  IIronSwap,
  IronControllerInterface,
  IUniswapV2Pair,
  PriceCalculator,
  RErc20Storage,
  RTokenInterface,
  SmartVault
} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {mkdir, writeFileSync} from "fs";
import {BigNumber, utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {VaultUtils} from "../../../test/VaultUtils";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const controller = await DeployerUtils.connectInterface(signer, 'IronControllerInterface', MaticAddresses.IRON_CONTROLLER) as IronControllerInterface;
  const priceCalculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;

  const markets = await controller.getAllMarkets();
  console.log('markets', markets.length);

  const vaultInfos = await VaultUtils.getVaultInfoFromServer();
  const underlyingStatuses = new Map<string, boolean>();
  const currentRewards = new Map<string, number>();
  const underlyingToVault = new Map<string, string>();
  for (const vInfo of vaultInfos) {
    if (vInfo.platform !== '9') {
      continue;
    }
    underlyingStatuses.set(vInfo.underlying.toLowerCase(), vInfo.active);
    underlyingToVault.set(vInfo.underlying.toLowerCase(), vInfo.addr);
    if (vInfo.active) {
      const vctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vInfo.addr) as SmartVault;
      currentRewards.set(vInfo.underlying.toLowerCase(), await VaultUtils.vaultRewardsAmount(vctr, core.psVault));
    }
  }

  console.log('loaded vault', underlyingStatuses.size);

  const rewardPrice = await priceCalculator.getPriceWithDefaultOutput(MaticAddresses.ICE_TOKEN);
  console.log('reward price', utils.formatUnits(rewardPrice));

  let infos: string = 'idx, rToken_name, rToken_address, token, tokenName, collateralFactor, borrowTarget, tvl, apr, vault, current rewards \n';
  for (let i = 0; i < markets.length; i++) {
    console.log('id', i);

    // if (i === 5 || i === 6) {
    //   console.log('skip volatile assets')
    //   continue;
    // }


    const rTokenAdr = markets[i];
    const rTokenName = await TokenUtils.tokenSymbol(rTokenAdr);
    console.log('rTokenName', rTokenName, rTokenAdr)
    const rTokenCtr = await DeployerUtils.connectInterface(signer, 'RTokenInterface', rTokenAdr) as RTokenInterface;
    const rTokenCtr2 = await DeployerUtils.connectInterface(signer, 'RErc20Storage', rTokenAdr) as RErc20Storage;
    let token: string;
    if (i === 2) {
      token = MaticAddresses.WMATIC_TOKEN;
    } else {
      token = await rTokenCtr2.underlying();
    }

    const tokenName = await TokenUtils.tokenSymbol(token);

    const collateralFactor = +utils.formatUnits((await controller.markets(rTokenAdr)).collateralFactorMantissa) * 10000;
    const borrowTarget = Math.floor(collateralFactor * 0.99);

    const status = underlyingStatuses.get(token.toLowerCase());
    if (status != null && !status) {
      console.log('deactivated');
      continue;
    }
    const undPrice = +utils.formatUnits(await priceCalculator.getPriceWithDefaultOutput(token));

    const undDec = await TokenUtils.decimals(token);
    const cash = +utils.formatUnits(await rTokenCtr.getCash(), undDec);
    const borrowed = +utils.formatUnits(await rTokenCtr.totalBorrows(), undDec);
    const reserves = +utils.formatUnits(await rTokenCtr.totalReserves(), undDec);

    const tvl = (cash + borrowed - reserves) * undPrice;
    const apr = 0;
    const curRewards = currentRewards.get(token.toLowerCase());
    const vault = underlyingToVault.get(token.toLowerCase());

    const data = i + ',' +
      rTokenName + ',' +
      rTokenAdr + ',' +
      token + ',' +
      tokenName + ',' +
      (collateralFactor - 1) + ',' +
      borrowTarget + ',' +
      tvl.toFixed(2) + ',' +
      apr + ',' +
      vault + ',' +
      curRewards


    console.log(data);
    infos += data + '\n';
  }

  mkdir('./tmp/download', {recursive: true}, (err) => {
    if (err) throw err;
  });

  // console.log('data', data);
  writeFileSync('./tmp/download/iron_markets.csv', infos, 'utf8');
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
    return collectTokensInfoIronSwap(signer, lp);
  } else {
    return collectTokensInfoUniswap(signer, lp);
  }
}

async function collectTokensInfoIronSwap(signer: SignerWithAddress, lp: string): Promise<string[]> {
  const lpContract = await DeployerUtils.connectInterface(signer, 'IIronLpToken', lp) as IIronLpToken;
  const swapAddress = await lpContract.swap();
  const swapContract = await DeployerUtils.connectInterface(signer, 'IIronSwap', swapAddress) as IIronSwap;
  return swapContract.getTokens();
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
