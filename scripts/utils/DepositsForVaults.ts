import {ethers} from "hardhat";

import {utils} from "ethers";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Bookkeeper, ContractReader, PriceCalculator} from "../../typechain";
import {Erc20Utils} from "../../test/Erc20Utils";
import {RunHelper} from "./RunHelper";
import {VaultUtils} from "../../test/VaultUtils";
import {UniswapUtils} from "../../test/UniswapUtils";
import {MaticAddresses} from "../../test/MaticAddresses";


async function main() {
  const signer = (await ethers.getSigners())[0];
  const tools = await DeployerUtils.getToolsAddresses();
  const core = await DeployerUtils.getCoreAddresses();

  const bookkeeper = await DeployerUtils.connectContract(
      signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;
  const cReader = await DeployerUtils.connectContract(
      signer, "ContractReader", tools.reader) as ContractReader;
  const priceCalculator = await DeployerUtils.connectContract(
      signer, "PriceCalculator", tools.calculator) as PriceCalculator;


  const percentOfBalance = 0.1;
  const vaults = await bookkeeper.vaults();
  console.log('vaults ', vaults.length);

  for (let vault of vaults) {
    let vInfoWithUser;
    try {
      vInfoWithUser = await cReader.vaultWithUserInfos(signer.address, [vault]);
    } catch (e) {
      console.log('error fetch vault info for', vault, e);
      continue;
    }
    const vInfo = vInfoWithUser[0].vault
    const uInfo = vInfoWithUser[0].user

    if (!vInfo.active) {
      console.log('inactive ', vInfo.name);
      continue;
    }

    const underlying = vInfo.underlying;
    const decimals = vInfo.decimals.toNumber();
    const userBalanceUsdc = uInfo.depositedUnderlyingUsdc;

    if (!userBalanceUsdc.isZero()) {
      console.log('already deposited', utils.formatUnits(userBalanceUsdc, 18),
          vInfo.name, utils.formatUnits(vInfo.tvlUsdc, 18));
      continue;
    }

    const vaultContract = await DeployerUtils.connectVault(vault, signer);


    let availableAmount = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), decimals);
    if (availableAmount === 0) {
      console.error('zero balance', await Erc20Utils.tokenSymbol(underlying), underlying);

      // ************ TRY TO CREATE UNDERLYING

      const assets = vInfo.assets;
      let factory;

      if (vInfo.platform === 3) {
        factory = MaticAddresses.SUSHI_FACTORY;
      } else if (vInfo.platform === 2) {
        factory = MaticAddresses.QUICK_FACTORY;
      } else if (vInfo.platform === 4) {
        factory = MaticAddresses.WAULT_FACTORY;
      } else {
        console.log('unknown platform ' + vInfo.platform);
        continue;
      }

      if (assets.length === 1) {
        continue; // TODO fix
        const tokenToBuy = assets[0];
        const tokenToBuyName = await Erc20Utils.tokenSymbol(tokenToBuy);
        console.log('try to buy', tokenToBuyName);

        const priceData0 = (await priceCalculator.getLargestPool(tokenToBuy, []));
        const tokenOpposite = priceData0[0];

        if ((await Erc20Utils.balanceOf(tokenOpposite, signer.address)).isZero()) {
          console.log('zero opposite token', tokenOpposite, await Erc20Utils.tokenSymbol(tokenOpposite));
          continue;
        }

        const tokenOppositeFactory = await priceCalculator.swapFactories(priceData0[1]);

        const amountForSell = await UniswapUtils.amountForSell(1, tokenOpposite, priceCalculator);

        await UniswapUtils.buyToken(
            signer,
            MaticAddresses.getRouterByFactory(tokenOppositeFactory),
            tokenToBuy,
            amountForSell.div(100),
            tokenOpposite,
            true
        );

      } else {
        const token0 = assets[0];
        const token1 = assets[1];

        const data0 = (await priceCalculator.getLargestPool(token0, []));
        const token0Opposite = data0[0];
        const token0OppositeFactory = await priceCalculator.swapFactories(data0[1]);

        const data1 = (await priceCalculator.getLargestPool(token1, []));
        const token1Opposite = data1[0];
        const token1OppositeFactory = await priceCalculator.swapFactories(data1[1]);

        if ((await Erc20Utils.balanceOf(token0Opposite, signer.address)).isZero()) {
          console.log('zero opposite token0', token0Opposite, await Erc20Utils.tokenSymbol(token0Opposite));
          continue;
        }

        if ((await Erc20Utils.balanceOf(token1Opposite, signer.address)).isZero()) {
          console.log('zero opposite token0', token1Opposite, await Erc20Utils.tokenSymbol(token1Opposite));
          continue;
        }

        const baseAmount = 1;
        let token0Bal = await Erc20Utils.balanceOf(token0, signer.address);
        let token1Bal = await Erc20Utils.balanceOf(token1, signer.address);

        if (token0Bal.isZero()) {
          const name0 = await Erc20Utils.tokenSymbol(token0Opposite);
          const dec0 = await Erc20Utils.decimals(token0Opposite);
          const price0 = parseFloat(utils.formatUnits(await priceCalculator.getPriceWithDefaultOutput(token0Opposite)));
          console.log('token0Opposite Price', price0, name0);
          const amountForSell0 = baseAmount / price0;
          console.log('amountForSell0', amountForSell0);

          await UniswapUtils.buyToken(signer, MaticAddresses.getRouterByFactory(token0OppositeFactory), token0,
              utils.parseUnits(amountForSell0.toFixed(dec0), dec0).div(100), token0Opposite, true);
          token0Bal = await Erc20Utils.balanceOf(token0, signer.address)
        }

        if (token1Bal.isZero()) {
          const name1 = await Erc20Utils.tokenSymbol(token1Opposite);
          const dec1 = await Erc20Utils.decimals(token1Opposite);
          const price1 = parseFloat(utils.formatUnits(await priceCalculator.getPriceWithDefaultOutput(token1Opposite)));
          console.log('token1Opposite Price', price1, name1);
          const amountForSell1 = baseAmount / price1;
          console.log('amountForSell1', amountForSell1);

          await UniswapUtils.buyToken(signer, MaticAddresses.getRouterByFactory(token1OppositeFactory), token1,
              utils.parseUnits(amountForSell1.toFixed(dec1), dec1).div(100), token1Opposite, true);
          token1Bal = await Erc20Utils.balanceOf(token1, signer.address);
        }

        await UniswapUtils.addLiquidity(
            signer,
            token0,
            token1,
            (token0Bal).div(10).toString(),
            (token1Bal).div(10).toString(),
            factory,
            MaticAddresses.getRouterByFactory(factory),
            true
        );

      }

    }

    availableAmount = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), decimals);

    if (availableAmount == 0) {
      console.log('still zero underlying');
      continue;
    }


    console.log("availableAmount", availableAmount)
    const depositN = ((availableAmount * percentOfBalance) * Math.random()) + (availableAmount * percentOfBalance);
    console.log("depositN", depositN);

    const deposit = utils.parseUnits(depositN.toFixed(decimals), decimals);
    if (deposit.isZero()) {
      console.log('zero final amount');
      continue;
    }
    await RunHelper.runAndWait(() => VaultUtils.deposit(signer, vaultContract, deposit));

    console.log('deposited ', await vaultContract.name(), depositN, 'availableAmount', availableAmount)
  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
