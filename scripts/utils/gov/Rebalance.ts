import { ethers } from 'hardhat';
import { DeployerUtils } from '../../deploy/DeployerUtils';
import {
  ContractReader,
  IUniswapV2Pair,
  MultiSwap,
  SmartVault,
  ZapContract,
} from '../../../typechain';
import { TokenUtils } from '../../../test/TokenUtils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { RunHelper } from '../tools/RunHelper';
import { utils } from 'ethers';
import { expect } from 'chai';
import { UniswapUtils } from '../../../test/UniswapUtils';
import { MaticAddresses } from '../../addresses/MaticAddresses';

const exclude = new Set<string>([
  '0x21d97B1adcD2A36756a6E0Aa1BAC3Cf6c0943c0E'.toLowerCase(),
  '0xf21cff0a852b8122139d1fd0403caabd37838c72'.toLowerCase(), // USDC-ICE Iron
  '0xc8c69afe55c3ab9545c4081a1494394d6300ca4f'.toLowerCase(), // ICE-IRON Iron
  '0x1d55e83f0eac3525fd25887cba6f2dfda1d50ba1'.toLowerCase(), // IS3USD-IRON Iron
  '0x2cf25555b4f357e701d174f3e0c0c84d5f8a3595'.toLowerCase(), // ICE-WETH Iron
  '0xcdf69bd9aff6f0a87c6c79ca07a357b465e165ba'.toLowerCase(), // USDC-USDT-DAI Iron
  '0x6781e4a6E6082186633130f08246a7af3A7B8b40'.toLowerCase(), // iron lending
  '0xeE3B4Ce32A6229ae15903CDa0A5Da92E739685f7'.toLowerCase(), // iron lending
  '0xd051605E07C2B526ED9406a555601aA4DB8490D9'.toLowerCase(), // iron lending
  '0xE680e0317402ad3CB37D5ed9fc642702658Ef57F'.toLowerCase(), // iron lending
  '0x0aEbfEf9ECbBb13878b4802Acfa7E0EfE52D75cd'.toLowerCase(), // iron lending
  '0xacee7bd17e7b04f7e48b29c0c91af67758394f0f'.toLowerCase(), // dxTETU
  '0x130f6814628A911777689b8e558F68868B3f0eBB'.toLowerCase(), // cafe
  '0xfA9D84A7aC9e2dC4DD43D566673B6C018E601b44'.toLowerCase(), // cafe
  '0xd8288634480414740Eaf387C412d211432543f36'.toLowerCase(), // cafe
  '0xF4a096F50E8DA8aA140e65BD27Ed21B522b3dA49'.toLowerCase(), // cafe
]);

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddressesWrapper(signer);
  const tools = await DeployerUtils.getToolsAddresses();
  const tokens = await DeployerUtils.getTokenAddresses();

  const zap = (await DeployerUtils.connectInterface(
    signer,
    'ZapContract',
    '0xB0362969D769F3224c2C809819A26C25610FF8d2' as string
  )) as ZapContract;
  const mSwap = (await DeployerUtils.connectInterface(
    signer,
    'MultiSwap',
    tools.multiSwap as string
  )) as MultiSwap;

  const contractReader = (await DeployerUtils.connectInterface(
    signer,
    'ContractReader',
    tools.reader as string
  )) as ContractReader;

  const vaults = await contractReader.vaults();
  console.log('vaults', vaults.length);

  // await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10'));

  for (let i = 0; i < vaults.length; i++) {
    try {
      const vault = vaults[i];
      console.log(i, await contractReader.vaultName(vault));
      const vCtr = (await DeployerUtils.connectInterface(
        signer,
        'SmartVault',
        vault
      )) as SmartVault;

      const und = await vCtr.underlying();
      const undPrice = +utils.formatUnits(await contractReader.getPrice(und));
      const undDec = await TokenUtils.decimals(und);
      const undBal = +utils.formatUnits(
        await vCtr.underlyingBalanceInVault(),
        undDec
      );

      const strategy = await vCtr.strategy();
      const undBalStrat = +utils.formatUnits(
        await TokenUtils.balanceOf(und, strategy),
        undDec
      );
      if (undBal * undPrice < 100 && undBalStrat * undPrice < 100) {
        console.log(
          'too low und balance',
          vault,
          (undBal * undPrice).toFixed(2),
          (undBalStrat * undPrice).toFixed(2)
        );
        continue;
      }
      console.log('vault bal', (undBal * undPrice).toFixed(2));
      console.log('strat bal', (undBalStrat * undPrice).toFixed(2));

      const platform = await contractReader.strategyPlatform(
        await vCtr.strategy()
      );
      if (
        (await contractReader.strategyAssets(await vCtr.strategy())).length !==
          2 ||
        exclude.has(vault.toLowerCase()) ||
        !(await contractReader.vaultActive(vault)) ||
        undBal * undPrice + undBalStrat * undPrice < 100 ||
        platform !== 2
      ) {
        continue;
      }

      await zapInVaultWithLp(
        signer,
        mSwap,
        zap,
        contractReader,
        vault,
        MaticAddresses.USDC_TOKEN,
        0.01,
        10
      );

      // const amountShare = await TokenUtils.balanceOf(vault, signer.address);
      // if (amountShare.isZero()) {
      //   console.log('zero balance');
      //   continue;
      // }

      // await zapOutVaultWithLp(
      //   signer,
      //   mSwap,
      //   zap,
      //   contractReader,
      //   vault,
      //   MaticAddresses.USDC_TOKEN,
      //   amountShare.toString()
      // );
    } catch (e) {
      console.error('error with', vaults[i]);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function zapInVaultWithLp(
  signer: SignerWithAddress,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  cReader: ContractReader,
  vault: string,
  tokenIn: string,
  amountN = 1000,
  slippage: number
) {
  console.log('zap lp in', amountN, slippage);
  const tokenInDec = await TokenUtils.decimals(tokenIn);
  const amount = utils.parseUnits(amountN.toString(), tokenInDec);
  expect(
    +utils.formatUnits(
      await TokenUtils.balanceOf(tokenIn, signer.address),
      tokenInDec
    )
  ).is.greaterThanOrEqual(amountN);

  const smartVault = (await DeployerUtils.connectInterface(
    signer,
    'SmartVault',
    vault
  )) as SmartVault;
  const strategy = await smartVault.strategy();
  const assets = await cReader.strategyAssets(strategy);
  if (assets.length !== 2) {
    throw Error('wrong vault assets');
  }

  const tokensOut: string[] = [];
  const tokensOutLps: string[][] = [];
  for (const asset of assets) {
    let lps: string[] = [];
    if (tokenIn.toLowerCase() !== asset.toLowerCase()) {
      lps = await multiSwap.findLpsForSwaps(tokenIn, asset);
    }

    console.log(
      'zapLpIn ============',
      await TokenUtils.tokenSymbol(tokenIn),
      '=>',
      await TokenUtils.tokenSymbol(asset)
    );
    for (const lp of lps) {
      const lpCtr = (await DeployerUtils.connectInterface(
        signer,
        'IUniswapV2Pair',
        lp
      )) as IUniswapV2Pair;
      const t0 = await lpCtr.token0();
      const t1 = await lpCtr.token1();
      console.log(
        'lp',
        await TokenUtils.tokenSymbol(t0),
        await TokenUtils.tokenSymbol(t1)
      );
    }
    console.log('============');

    tokensOut.push(asset);
    tokensOutLps.push(lps);
  }

  // await RunHelper.runAndWait(() => TokenUtils.approve(tokenIn, signer, zapContract.address, amount.toString()));
  await RunHelper.runAndWait(() =>
    zapContract
      .connect(signer)
      .zapIntoLp(
        vault,
        tokenIn,
        tokensOut[0],
        tokensOutLps[0],
        tokensOut[1],
        tokensOutLps[1],
        amount,
        slippage
      )
  );
}

async function zapOutVaultWithLp(
  signer: SignerWithAddress,
  multiSwap: MultiSwap,
  zapContract: ZapContract,
  cReader: ContractReader,
  vault: string,
  tokenOut: string,
  amountShare: string
) {
  const smartVault = (await DeployerUtils.connectInterface(
    signer,
    'SmartVault',
    vault
  )) as SmartVault;
  const strategy = await smartVault.strategy();
  const assets = await cReader.strategyAssets(strategy);
  const assetsLpRoute: string[][] = [];

  for (const asset of assets) {
    const lps = [
      ...(await multiSwap.findLpsForSwaps(tokenOut, asset)),
    ].reverse();
    assetsLpRoute.push(lps);
  }

  await RunHelper.runAndWait(async () =>
    TokenUtils.approve(
      vault,
      signer,
      zapContract.address,
      amountShare.toString()
    )
  );
  await RunHelper.runAndWait(() =>
    zapContract.zapOutLp(
      vault,
      tokenOut,
      assets[0],
      assetsLpRoute[0],
      assets[1],
      assetsLpRoute[1],
      amountShare,
      9
    )
  );
}
