import {Erc20Utils} from "../../Erc20Utils";
import {MaticAddresses} from "../../MaticAddresses";
import {TetuLoans} from "../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {utils} from "ethers";

const {expect} = chai;
chai.use(chaiAsPromised);

export class LoanUtils {


  public static async openErc20ForUsdc(
      signer: SignerWithAddress,
      loan: TetuLoans,
      collateralToken: string,
      collateralAmount: string,
      acquiredAmount: string,
      loanDurationBlocks = 99,
      loanFee = 100
  ): Promise<number> {
    console.log("Try to open erc20 position for usdc");
    const bal = await Erc20Utils.balanceOf(collateralToken, signer.address);
    const dec = await Erc20Utils.decimals(collateralToken);
    expect(+utils.formatUnits(bal, dec))
    .is.greaterThanOrEqual(+utils.formatUnits(collateralAmount, dec),
        'not enough balance for open position')

    await Erc20Utils.approve(collateralToken, signer, loan.address, collateralAmount);
    await loan.connect(signer).openPosition(
        collateralToken,
        collateralAmount,
        0,
        MaticAddresses.USDC_TOKEN,
        acquiredAmount,
        loanDurationBlocks,
        loanFee
    );
    const id = (await loan.loansCounter()).toNumber() - 1;
    console.log('Position opened', id);
    return id;
  }

  public static async closePosition(id: number, signer: SignerWithAddress, loan: TetuLoans): Promise<void> {
    console.log('Try to close position', id);
    await loan.connect(signer).closePosition(id);
  }

}
