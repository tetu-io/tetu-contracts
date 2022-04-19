import {MaticAddresses} from "../../../addresses/MaticAddresses";

interface IForwarderBalInfo {
  balToken: string;
  vault: string;
  pool: string;
  tokenOut: string;
}

const balInfo: IForwarderBalInfo = {
    balToken: MaticAddresses.BAL_TOKEN,
    vault: MaticAddresses.BALANCER_VAULT,
    pool: MaticAddresses.BALANCER_POOL_WMATIC_USDC_WETH_BAL_ID,
    tokenOut: MaticAddresses.USDC_TOKEN,
  }

export {balInfo}
