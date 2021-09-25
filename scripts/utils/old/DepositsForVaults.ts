import {ethers} from "hardhat";

import {BigNumber, utils} from "ethers";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper, ContractReader, PriceCalculator} from "../../../typechain";
import {Erc20Utils} from "../../../test/Erc20Utils";
import {RunHelper} from "../RunHelper";
import {VaultUtils} from "../../../test/VaultUtils";
import {UniswapUtils} from "../../../test/UniswapUtils";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";


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


  const percentOfBalance = 0.95;
  const sellRatio = 3;
  const expectedDeposit = 300;
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
    const vaultBalanceUsd = +utils.formatUnits(vInfo.tvlUsdc);

    if (vaultBalanceUsd > expectedDeposit) {
      console.log('enough liq', vaultBalanceUsd, vInfo.name, vaultBalanceUsd);
      continue;
    }
    console.log('vInfo.name', vInfo.name);

    const vaultContract = await DeployerUtils.connectVault(vault, signer);


    let availableAmount = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), decimals);

    const undPrice = +utils.formatUnits(await priceCalculator.getPriceWithDefaultOutput(underlying));

    if (availableAmount * undPrice < expectedDeposit * 0.8) {
      console.error('availableAmount too low', await Erc20Utils.tokenSymbol(underlying), availableAmount);

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
            amountForSell,
            tokenOpposite,
            true
        );

      } else {
        const token0 = assets[0];
        const token1 = assets[1];

        const token0Name = await Erc20Utils.tokenSymbol(token0);
        const token1Name = await Erc20Utils.tokenSymbol(token1);

        const tokenDec0 = await Erc20Utils.decimals(token0);
        const tokenDec1 = await Erc20Utils.decimals(token1);

        const token0Price = +utils.formatUnits(await priceCalculator.getPriceWithDefaultOutput(token0));
        const token1Price = +utils.formatUnits(await priceCalculator.getPriceWithDefaultOutput(token1));

        let token0Bal = await Erc20Utils.balanceOf(token0, signer.address);
        let token0BalN = +utils.formatUnits(token0Bal, tokenDec0);
        let token1Bal = await Erc20Utils.balanceOf(token1, signer.address);
        let token1BalN = +utils.formatUnits(token1Bal, tokenDec1);

        const amountForDeposit0N = expectedDeposit / 2 / token0Price;
        const amountForDeposit1N = expectedDeposit / 2 / token1Price;

        console.log('token0', token0Name, amountForDeposit0N, token0Price);
        console.log('token1', token1Name, amountForDeposit1N, token1Price);


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

        if (token0BalN < amountForDeposit0N) {
          token0Bal = await buyToken(
              signer,
              priceCalculator,
              token0BalN,
              amountForDeposit0N,
              token0Price,
              token0Opposite,
              token0OppositeFactory,
              token0
          );
        }

        if (token1BalN < amountForDeposit1N) {
          token1Bal = await buyToken(
              signer,
              priceCalculator,
              token1BalN,
              amountForDeposit1N,
              token1Price,
              token1Opposite,
              token1OppositeFactory,
              token1
          );
        }

        const amountForDeposit0 = utils.parseUnits(amountForDeposit0N.toFixed(tokenDec0), tokenDec0);
        const amountForDeposit1 = utils.parseUnits(amountForDeposit1N.toFixed(tokenDec1), tokenDec1);

        console.log('amountForDeposit0', amountForDeposit0N);
        console.log('amountForDeposit1', amountForDeposit1N);

        await UniswapUtils.addLiquidity(
            signer,
            token0,
            token1,
            (amountForDeposit0).toString(),
            (amountForDeposit1).toString(),
            factory,
            MaticAddresses.getRouterByFactory(factory),
            true
        );

      }

    }

    availableAmount = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), decimals);

    if (availableAmount * undPrice < expectedDeposit * 0.8) {
      console.log('still too low balance', availableAmount, availableAmount * undPrice);
      break;
    }


    console.log("availableAmount", availableAmount)
    // const depositN = availableAmount * percentOfBalance;
    // console.log("depositN", depositN);

    // const deposit = utils.parseUnits(depositN.toFixed(decimals), decimals);
    const deposit = await Erc20Utils.balanceOf(underlying, signer.address);
    if (deposit.isZero()) {
      console.log('zero final amount');
      continue;
    }
    await RunHelper.runAndWait(() => VaultUtils.deposit(signer, vaultContract, deposit));

    console.log('!!!!! DEPOSITED ', await vaultContract.name(), 'availableAmount', availableAmount)
  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});

async function buyToken(
    signer: SignerWithAddress,
    priceCalculator: PriceCalculator,
    tokenBalN: number,
    amountForDepositN: number,
    tokenPrice: number,
    tokenOpposite: string,
    tokenOppositeFactory: string,
    token: string
): Promise<BigNumber> {
  const oppositeName = await Erc20Utils.tokenSymbol(tokenOpposite);
  const oppositeDec = await Erc20Utils.decimals(tokenOpposite);
  console.log('need to sell opposite token for buy token', oppositeName, tokenBalN, amountForDepositN);
  const tokenNeedToBuy = (amountForDepositN - tokenBalN);
  const tokenNeedToBuyUsd = tokenNeedToBuy * tokenPrice;
  const oppositeTokenPrice0 = parseFloat(utils.formatUnits(await priceCalculator.getPriceWithDefaultOutput(tokenOpposite)));
  const amountForSell0N = tokenNeedToBuyUsd / oppositeTokenPrice0 * 1.5;
  console.log('need to buy', tokenNeedToBuy, tokenNeedToBuyUsd, amountForSell0N);
  const amountForSell0 = utils.parseUnits(amountForSell0N.toFixed(oppositeDec), oppositeDec);
  console.log('amountForSell', utils.formatUnits(amountForSell0, oppositeDec));

  await UniswapUtils.buyToken(signer, MaticAddresses.getRouterByFactory(tokenOppositeFactory), token,
      amountForSell0, tokenOpposite, true);
  return await Erc20Utils.balanceOf(token, signer.address)
}
