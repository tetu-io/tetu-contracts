import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {MaticAddresses} from "../../../test/MaticAddresses";
import {
  IAaveProtocolDataProvider, IAToken,
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

//todo add commented functionality if needed.


async function main() {
    const signer = (await ethers.getSigners())[0];
    const core = await DeployerUtils.getCoreAddresses();
    const tools = await DeployerUtils.getToolsAddresses();

    const controller = await DeployerUtils.connectInterface(
      signer, 'IAaveProtocolDataProvider', MaticAddresses.AAVE_PROTOCOL_DATA_PROVIDER) as IAaveProtocolDataProvider;
    const priceCalculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator;

    const allLendingTokens = await controller.getAllATokens();
    console.log('Lending tokens', allLendingTokens.length);

    // const vaultInfos = await VaultUtils.getVaultInfoFromServer();
    // const underlyingStatuses = new Map<string, boolean>();
    // const currentRewards = new Map<string, number>();
    // const underlyingToVault = new Map<string, string>();
    // for (const vInfo of vaultInfos) {
    //   if (vInfo.platform !== '9') {
    //     continue;
    //   }
    //   underlyingStatuses.set(vInfo.underlying.toLowerCase(), vInfo.active);
    //   underlyingToVault.set(vInfo.underlying.toLowerCase(), vInfo.addr);
    //   if (vInfo.active) {
    //     const vctr = await DeployerUtils.connectInterface(signer, 'SmartVault', vInfo.addr) as SmartVault;
    //     currentRewards.set(vInfo.underlying.toLowerCase(), await VaultUtils.vaultRewardsAmount(vctr, core.psVault));
    //   }
    // }
    // console.log('loaded vault', underlyingStatuses.size);

    // const rewardPrice = await priceCalculator.getPriceWithDefaultOutput(MaticAddresses.ICE_TOKEN);
    // console.log('reward price', utils.formatUnits(rewardPrice));

    let infos: string = 'idx, aToken_name, aToken_address, token, tokenName, collateralFactor, borrowTarget, tvl, apr, vault, current rewards \n';
    for (let i = 0; i < allLendingTokens.length; i++) {
      console.log('id', i);

      if (i === 5 || i === 6) {
        console.log('skip volatile assets')
        continue;
      }


      const aTokenAdr = allLendingTokens[i][1];
      const aTokenName = allLendingTokens[i][0];
      console.log('aTokenName', aTokenName, aTokenAdr)
      // const rTokenCtr = await DeployerUtils.connectInterface(signer, 'RTokenInterface', aTokenAdr) as RTokenInterface;
      const rTokenCtr2 = await DeployerUtils.connectInterface(signer, 'IAToken', aTokenAdr) as IAToken;
      let token = await rTokenCtr2.UNDERLYING_ASSET_ADDRESS();

      const tokenName = await TokenUtils.tokenSymbol(token);


      // const collateralFactor = +utils.formatUnits((await controller.markets(rTokenAdr)).collateralFactorMantissa) * 10000;
      // const borrowTarget = Math.floor(collateralFactor * 0.9);
      //
      // const status = underlyingStatuses.get(token.toLowerCase());
      // if (status != null && !status) {
      //   console.log('deactivated');
      //   continue;
      // }
      // const undPrice = +utils.formatUnits(await priceCalculator.getPriceWithDefaultOutput(token));
      //
      // const undDec = await TokenUtils.decimals(token);
      // const cash = +utils.formatUnits(await rTokenCtr.getCash(), undDec);
      // const borrowed = +utils.formatUnits(await rTokenCtr.totalBorrows(), undDec);
      // const reserves = +utils.formatUnits(await rTokenCtr.totalReserves(), undDec);
      //
      // const tvl = (cash + borrowed - reserves) * undPrice;
      // const apr = 0;
      // const curRewards = currentRewards.get(token.toLowerCase());
      // const vault = underlyingToVault.get(token.toLowerCase());

      const data = i + ',' +
        aTokenName + ',' +
        aTokenAdr + ',' +
        token + ',' +
        tokenName + ',' +
        ("collateralFactor - 1") + ',' +
        'borrowTarget' + ',' +
        'tvl.toFixed(2)' + ',' +
        'apr' + ',' +
        'vault' + ',' +
        'curRewards'


      console.log(data);
      infos += data + '\n';
    }

    mkdir('./tmp/download', {recursive: true}, (err) => {
      if (err) throw err;
    });

    // console.log('data', data);
    writeFileSync('./tmp/download/aave_markets.csv', infos, 'utf8');
    console.log('done');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
