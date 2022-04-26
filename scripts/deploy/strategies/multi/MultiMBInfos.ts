import {MaticAddresses} from "../../../addresses/MaticAddresses";

interface IMBInfo {
  underlyingName: string,
  underlying: string,
  stablecoin: string,
  targetPercentage: string,
  collateralNumerator?: string, // will be used '1' on deploy, when undefined
}

const infos: IMBInfo[] = [
    // for now CelsiusX only tokens.
    // same strategy can be used for all other MAI vaults
  {
    underlyingName: 'cxDOGE',
    underlying: MaticAddresses.cxDOGE_TOKEN,
    stablecoin: MaticAddresses.cxDOGE_MAI_VAULT,
    targetPercentage: '300',
  },
  {
    underlyingName: 'cxADA',
    underlying: MaticAddresses.cxADA_TOKEN,
    stablecoin: MaticAddresses.cxADA_MAI_VAULT,
    targetPercentage: '300',
  },
  {
    underlyingName: 'cxETH',
    underlying: MaticAddresses.cxETH_TOKEN,
    stablecoin: MaticAddresses.cxETH_MAI_VAULT,
    targetPercentage: '300',
  },
]

export {IMBInfo, infos}
