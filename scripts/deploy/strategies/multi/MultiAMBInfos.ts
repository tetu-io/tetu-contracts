import {MaticAddresses} from "../../../addresses/MaticAddresses";

const infos: {
  underlyingName: string,
  underlying: string,
  camToken: string,
  amToken: string,
  stablecoin: string,
  targetPercentage: string,
  liquidationPercentage: string,
}[] = [
  {
    underlyingName: 'AAVE',
    underlying: MaticAddresses.AAVE_TOKEN,
    camToken: MaticAddresses.CAMAAVE_TOKEN,
    amToken: MaticAddresses.AMAAVE_TOKEN,
    stablecoin: MaticAddresses.camAAVEVault,
    targetPercentage: '200',
    liquidationPercentage: '135',
  },
  // {
  //   underlyingName: 'WMATIC',
  //   underlying: MaticAddresses.WMATIC_TOKEN,
  //   camToken: MaticAddresses.CAMWMATIC_TOKEN,
  // },
  // {
  //   underlyingName: 'DAI',
  //   underlying: MaticAddresses.DAI_TOKEN,
  //   camToken: MaticAddresses.CAMDAI_TOKEN,
  // },
  // {
  //   underlyingName: 'WBTC',
  //   underlying: MaticAddresses.WBTC_TOKEN,
  //   camToken: MaticAddresses.CAMWBTC_TOKEN,
  // },
  // {
  //   underlyingName: 'WETH',
  //   underlying: MaticAddresses.WETH_TOKEN,
  //   camToken: MaticAddresses.CAMWETH_TOKEN,
  // },
]

export {infos}
