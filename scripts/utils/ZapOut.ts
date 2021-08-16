import {ethers} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {ContractReader, MultiSwap, SmartVault, ZapContract} from "../../typechain";
import {MaticAddresses} from "../../test/MaticAddresses";
import {Erc20Utils} from "../../test/Erc20Utils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {RunHelper} from "./RunHelper";


const exclude = new Set<string>([
  '0x21d97B1adcD2A36756a6E0Aa1BAC3Cf6c0943c0E'.toLowerCase(), // wex pear - has transfer fee
  '0xa281C7B40A9634BCD16B4aAbFcCE84c8F63Aedd0'.toLowerCase(), // frax fxs - too high slippage
]);

async function main() {
  const signer = (await ethers.getSigners())[2];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();

  const zap = await DeployerUtils.connectInterface(signer, 'ZapContract', tools.zapContract as string) as ZapContract;
  const mSwap = await DeployerUtils.connectInterface(signer, 'MultiSwap', tools.multiSwap as string) as MultiSwap;

  const contractReader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader as string) as ContractReader;

  const vaults = await contractReader.vaults();
  console.log('vaults', vaults.length);

  // let num = 0;
  // for (let v of vaults) {
  //   console.log(num, await contractReader.vaultName(v));
  //   num++;
  // }

  for (let i = 0; i < vaults.length; i++) {
    const vault = vaults[i];
    console.log(i, await contractReader.vaultName(vault));
    const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    if ((await contractReader.strategyAssets(await vCtr.strategy())).length !== 2
        || exclude.has(vault.toLowerCase())) {
      continue;
    }

    const amountShare = await Erc20Utils.balanceOf(vault, signer.address);
    if (amountShare.isZero()) {
      console.log('zero balance');
      continue;
    }

    await zapOutVaultWithLp(
        signer,
        mSwap,
        zap,
        contractReader,
        vault,
        MaticAddresses.USDC_TOKEN,
        amountShare.toString()
    );

  }


}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});


async function zapOutVaultWithLp(
    signer: SignerWithAddress,
    multiSwap: MultiSwap,
    zapContract: ZapContract,
    cReader: ContractReader,
    vault: string,
    tokenOut: string,
    amountShare: string
) {
  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
  const strategy = await smartVault.strategy()
  const assets = await cReader.strategyAssets(strategy);
  const assetsLpRoute: string[][] = [];

  for (let asset of assets) {
    const lps = [...await multiSwap.findLpsForSwaps(tokenOut, asset)].reverse();
    assetsLpRoute.push(lps);
  }

  await Erc20Utils.approve(vault, signer, zapContract.address, amountShare.toString())
  await RunHelper.runAndWait( () => zapContract.zapOutLp(
      vault,
      tokenOut,
      assets[0],
      assetsLpRoute[0],
      assets[1],
      assetsLpRoute[1],
      amountShare,
      9
  ));
}
