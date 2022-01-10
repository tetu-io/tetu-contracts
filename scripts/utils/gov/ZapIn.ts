import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {ContractReader, IUniswapV2Pair, MultiSwap, SmartVault, ZapContract} from "../../../typechain";
import {TokenUtils} from "../../../test/TokenUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {utils} from "ethers";
import {RunHelper} from "../tools/RunHelper";


const exclude = new Set<string>([
  '0x21d97B1adcD2A36756a6E0Aa1BAC3Cf6c0943c0E'.toLowerCase(), // wex pear - has transfer fee
  '0xa281C7B40A9634BCD16B4aAbFcCE84c8F63Aedd0'.toLowerCase(), // frax fxs - too high slippage
]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();
  const tools = await DeployerUtils.getToolsAddresses();
  const tokens = await DeployerUtils.getTokenAddresses();

  const zap = await DeployerUtils.connectInterface(signer, 'ZapContract', tools.zapContract as string) as ZapContract;
  const mSwap = await DeployerUtils.connectInterface(signer, 'MultiSwap', tools.multiSwap as string) as MultiSwap;

  const contractReader = await DeployerUtils.connectInterface(signer, 'ContractReader', tools.reader as string) as ContractReader;

  if ((await TokenUtils.allowance(await DeployerUtils.getUSDCAddress(), signer, zap.address)).lt(utils.parseUnits('100000', 6))) {
    await TokenUtils.approve(await DeployerUtils.getUSDCAddress(), signer, zap.address, utils.parseUnits('1000000', 6).toString());
  }


  const vaults = await contractReader.vaults();
  console.log('vaults', vaults.length);

  for (let i = 205; i < vaults.length; i++) {
    const vault = vaults[i];
    console.log(i, await contractReader.vaultName(vault));
    const vCtr = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
    if ((await contractReader.strategyAssets(await vCtr.strategy())).length !== 2
      || exclude.has(vault.toLowerCase())
      || !(await vCtr.active())
    ) {
      continue;
    }

    const vBal = await vCtr.underlyingBalanceWithInvestment();
    if (!vBal.isZero()) {
      console.log('has balance ', vBal.toString());
      continue;
    }

    await zapIntoVaultWithLp(
      signer,
      mSwap,
      zap,
      contractReader,
      vault,
      await DeployerUtils.getUSDCAddress(),
      '2',
      10
    );

  }


}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });


async function zapIntoVaultWithLp(
  signer: SignerWithAddress,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  cReader: ContractReader,
  vault: string,
  tokenIn: string,
  amountRaw = '1000',
  slippage: number
) {
  const tokenInDec = await TokenUtils.decimals(tokenIn);
  const amount = utils.parseUnits(amountRaw, tokenInDec);
  const signerBal = await TokenUtils.balanceOf(tokenIn, signer.address);
  console.log('signerBal', utils.formatUnits(signerBal, tokenInDec));
  if (amount.gt(signerBal)) {
    throw new Error('Not enough balance')
  }

  const smartVault = await DeployerUtils.connectInterface(signer, 'SmartVault', vault) as SmartVault;
  const strategy = await smartVault.strategy()
  const assets = await cReader.strategyAssets(strategy);

  const tokensOut: string[] = [];
  const tokensOutLps: string[][] = [];

  for (const asset of assets) {
    let lps: string[] = [];
    if (tokenIn.toLowerCase() !== asset.toLowerCase()) {
      lps = await multiSwap.findLpsForSwaps(tokenIn, asset);
    }

    console.log('============')
    for (const lp of lps) {
      const lpCtr = await DeployerUtils.connectInterface(signer, 'IUniswapV2Pair', lp) as IUniswapV2Pair;
      const t0 = await lpCtr.token0();
      const t1 = await lpCtr.token1();
      console.log('lp', await TokenUtils.tokenSymbol(t0), await TokenUtils.tokenSymbol(t1));
    }
    console.log('============')

    tokensOut.push(asset);
    tokensOutLps.push(lps);
  }

  await RunHelper.runAndWait(() => zapContract.connect(signer).zapIntoLp(
    vault,
    tokenIn,
    tokensOut[0],
    tokensOutLps[0],
    tokensOut[1],
    tokensOutLps[1],
    amount,
    slippage
  ));

  const balanceAfter = +utils.formatUnits(await TokenUtils.balanceOf(tokenIn, signer.address), tokenInDec);
  console.log('balance after ADD', balanceAfter);
}
