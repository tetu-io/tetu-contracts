import {formatUnits, parseUnits} from "ethers/lib/utils";
import {TokenUtils} from "../test/TokenUtils";
import {
  IERC20__factory,
  IERC20Metadata__factory,
  IStrategy__factory,
  ITetuLiquidator__factory
} from "../typechain";
import {MaticAddresses} from "./addresses/MaticAddresses";
import {DeployerUtils} from "./deploy/DeployerUtils";
import {Misc} from "./utils/tools/Misc";


const LIQUIDATOR = '0xC737eaB847Ae6A92028862fE38b828db41314772';
const AMOUNT_USD = 5000;
const USDC = MaticAddresses.USDC_TOKEN;

const TOKENS = [
  '0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a', // SUSHI
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
  '0x4c4bf319237d98a30a929a96112effa8da3510eb',
  '0x831753dd7087cac61ab5644b308642cc1c33dc13',
  '0x4a81f8796e0c6ad4877a51c86693b0de8093f2ef',
  '0xaa9654becca45b5bdfa5ac646c939c62b527d394',
  '0xa5eb60ca85898f8b26e18ff7c7e43623ccba772c',
  '0xdab35042e63e93cc8556c9bae482e5415b5ac4b1',
  '0xb5106a3277718ecad2f20ab6b86ce0fee7a21f09',
  '0x225084d30cc297f3b177d9f93f5c3ab8fb6a1454',
  '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
  '0x255707b70bf90aa112006e1b07b9aea6de021424',
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
  '0x172370d5cd63279efa6d502dab29171933a610af',
  '0xab0b2ddb9c7e440fac8e140a89c0dbcbf2d7bbff',
  '0x4e78011ce80ee02d2c3e649fb657e45898257815',
  '0x580a84c73811e1839f75d86d75d88cca0c241ff4',
  '0x9a71012b13ca4d3d0cdc72a177df3ef03b0e76a3',
  '0x8f3cf7ad23cd3cadbd9735aff958023239c6a063',
  '0x42d61d766b85431666b39b89c43011f24451bff6',
  '0x29f1e986fca02b7e54138c04c4f503dddd250558',
  '0xa3fa99a148fa48d14ed51d610c367c61876997f1',
  '0xdf9b4b57865b403e08c85568442f95c26b7896b0',
  '0x4cd44ced63d9a6fef595f6ad3f7ced13fceac768',
  '0xc46db78be28b5f2461097ed9e3fcc92e9ff8676d',
  '0x3066818837c5e6ed6601bd5a91b0762877a6b731',
  '0xc250e9987a032acac293d838726c511e6e1c029d',
  '0x17e9c5b37283ac5fbe527011cec257b832f03eb3',
  '0x82362ec182db3cf7829014bc61e9be8a2e82868a',
  '0x08c15fa26e519a78a666d19ce5c646d55047e0a3',
  '0x39ab6574c289c3ae4d88500eec792ab5b947a5eb',
  '0x9008d70a5282a936552593f410abcbce2f891a97',
  '0xc3c7d422809852031b44ab29eec9f1eff2a58756',
  '0x1d734a02ef1e1f5886e66b0673b71af5b53ffa94',
  '0xcd6c720e582884d7326d378b54efcc3da888898d'
]

const EXCLUDE = new Set<string>([
  MaticAddresses.SUSHI_TOKEN,
  MaticAddresses.WEXpoly_TOKEN,
  MaticAddresses.ICE_TOKEN,
  MaticAddresses.DINO_TOKEN,
  MaticAddresses.COSMIC_TOKEN,
  MaticAddresses.IRIS_TOKEN,
])

async function main() {
  const signer = await DeployerUtils.impersonate();
  const core = await DeployerUtils.getCoreAddressesWrapper(signer)

  const liquidator = ITetuLiquidator__factory.connect(LIQUIDATOR, signer);

  const strategies = await core.bookkeeper.strategies();

  const tokens = new Set<string>();

  // for (const strategy of strategies) {
  //   const rewards = await IStrategy__factory.connect(strategy, signer).rewardTokens();
  //   for (const reward of rewards) {
  //     tokens.add(reward.toLowerCase());
  //   }
  // }
  //
  // console.log('tokens', tokens);

  for (const token of TOKENS) {
    if (EXCLUDE.has(token.toLowerCase())) {
      continue;
    }
    const name = await IERC20Metadata__factory.connect(token, signer).symbol();
    console.log(name, token);

    const decimals = await IERC20Metadata__factory.connect(token, signer).decimals();

    await TokenUtils.getToken(token, signer.address);
    const balance = formatUnits(await IERC20__factory.connect(token, signer).balanceOf(signer.address), decimals);

    const price = +formatUnits(await liquidator.getPrice(token, USDC, 0), 6);

    const amountI = (AMOUNT_USD / price).toFixed(decimals)
    const amount = parseUnits(amountI)

    console.log(name, token, 'price:', price, 'amount:', amountI, 'balance:', balance);
    await IERC20__factory.connect(token, signer).approve(liquidator.address, Misc.MAX_UINT);
    await liquidator.liquidate(token, USDC, amount, 5_000);
  }

}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
