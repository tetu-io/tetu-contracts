import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {MaiStablecoinPipe, StrategyMaiBal} from "../../../../typechain";
import {TokenUtils} from "../../../TokenUtils";
import {utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

export class MBUtils {
  public static getSlotsInfo(underlying: string): { stablecoinAddress: string, priceSlotIndex: string } {
    underlying = underlying.toLowerCase();
    let stablecoinAddress: string;
    /* How to find slot index? go to https://web3playground.io/ , use code below and set contractAddress to stablecoinAddress
          find ethPriceSource() address at the list, and use its hexadecimal index.
          !Index must have no leading zeros (0xf, but no 0x0f) https://github.com/nomiclabs/hardhat/issues/1700

      async function main() {
        let contractAddress = '0x7CbF49E4214C7200AF986bc4aACF7bc79dd9C19a'
      for (let index = 0; index < 40; index++){
       console.log(`0x${index.toString(16)} /t` +
         await web3.eth.getStorageAt(contractAddress, index))
      }
      */
    const priceSlotIndex = '0xf';  // default slot for almost all tokens used crosschainQiStablecoinSlim
    if (underlying === MaticAddresses.cxDOGE_TOKEN) {
      stablecoinAddress = MaticAddresses.cxDOGE_MAI_VAULT;

    } else if (underlying === MaticAddresses.cxADA_TOKEN) {
      stablecoinAddress = MaticAddresses.cxADA_MAI_VAULT;

    } else if (underlying === MaticAddresses.cxETH_TOKEN) {
      stablecoinAddress = MaticAddresses.cxETH_MAI_VAULT;
      // priceSlotIndex = '0xf' // different from default slot. Param must have no leading zeros https://github.com/nomiclabs/hardhat/issues/1700

    } else {
      throw new Error('Unknown underlying ' + underlying);
    }
    return {
      "stablecoinAddress": stablecoinAddress,
      "priceSlotIndex": priceSlotIndex,
    }
  }

  public static async refuelMAI(signer: SignerWithAddress, strategy: string) {
    const strCtr = await DeployerUtils.connectInterface(signer, 'StrategyMaiBal', strategy) as StrategyMaiBal;
    const maiStbPipe = await strCtr.pipes(0);
    const maiStbPipeCtr = await DeployerUtils.connectInterface(signer, 'MaiStablecoinPipe', maiStbPipe) as MaiStablecoinPipe;
    const stablecoin = await maiStbPipeCtr.stablecoin()
    await TokenUtils.getToken(MaticAddresses.miMATIC_TOKEN, stablecoin, utils.parseUnits('1000000'));
  }
}
