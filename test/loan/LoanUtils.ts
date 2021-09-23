import {TokenUtils} from "../TokenUtils";
import {MaticAddresses} from "../MaticAddresses";
import {TetuLoans} from "../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {utils} from "ethers";

const {expect} = chai;
chai.use(chaiAsPromised);

export class LoanUtils {

  public static MAX_UINT = '115792089237316195423570985008687907853269984665640564039457584007913129639935';


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
    const bal = await TokenUtils.balanceOf(collateralToken, signer.address);
    const dec = await TokenUtils.decimals(collateralToken);
    expect(+utils.formatUnits(bal, dec))
    .is.greaterThanOrEqual(+utils.formatUnits(collateralAmount, dec),
        'not enough balance for open position')

    await TokenUtils.approve(collateralToken, signer, loan.address, collateralAmount);
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

  public static async openNftForUsdc(
      signer: SignerWithAddress,
      loan: TetuLoans,
      collateralToken: string,
      collateralId: string,
      acquiredAmount: string,
      loanDurationBlocks = 99,
      loanFee = 100
  ): Promise<number> {
    console.log("Try to open NFT position for usdc", collateralId);

    await TokenUtils.approveNFT(collateralToken, signer, loan.address, collateralId);
    await loan.connect(signer).openPosition(
        collateralToken,
        0,
        collateralId,
        MaticAddresses.USDC_TOKEN,
        acquiredAmount,
        loanDurationBlocks,
        loanFee
    );
    const id = (await loan.loansCounter()).toNumber() - 1;
    console.log('NFT Position opened', id);
    return id;
  }

  public static async closePosition(id: number, signer: SignerWithAddress, loan: TetuLoans): Promise<void> {
    console.log('Try to close position', id);
    await loan.connect(signer).closePosition(id);
  }

  public static async bid(id: number, amount: string, signer: SignerWithAddress, loan: TetuLoans) {
    console.log('Try to bid on position', id, amount);
    const l = await loan.loans(id);
    const aToken = l.acquired.acquiredToken;
    await TokenUtils.approve(aToken, signer, loan.address, amount);
    await loan.connect(signer).bid(id, amount);
  }

  public static async claim(id: number, signer: SignerWithAddress, loan: TetuLoans) {
    console.log('Try to claim on position', id);
    await loan.connect(signer).claim(id);
  }

  public static async redeem(id: number, signer: SignerWithAddress, loan: TetuLoans) {
    console.log('Try to redeem on position', id);
    const l = await loan.loans(id);
    const aToken = l.acquired.acquiredToken;
    const toRedeem = await loan.toRedeem(id);
    await TokenUtils.approve(aToken, signer, loan.address, toRedeem.toString());
    await loan.connect(signer).redeem(id);
  }
}
