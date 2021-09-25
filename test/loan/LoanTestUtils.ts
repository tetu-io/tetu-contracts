import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TetuLoans} from "../../typechain";
import {LoanUtils} from "./LoanUtils";
import {MaticAddresses} from "../MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {BigNumber} from "ethers";

const {expect} = chai;
chai.use(chaiAsPromised);

export class LoanTestUtils {


  public static async openErc20ForUsdcAndCheck(
      signer: SignerWithAddress,
      loan: TetuLoans,
      collateralToken: string,
      collateralAmount: string,
      acquiredAmount: string,
      loanDurationBlocks = 99,
      loanFee = 100,
  ): Promise<number> {
    const id = await LoanUtils.openErc20ForUsdc(
        signer,
        loan,
        collateralToken,
        collateralAmount,
        acquiredAmount,
        loanDurationBlocks,
        loanFee
    );

    await LoanTestUtils.checkPosition(
        id,
        signer,
        loan,
        collateralToken,
        collateralAmount,
        "0",
        0,
        acquiredAmount,
        loanDurationBlocks,
        loanFee,
    )
    return id;
  }

  public static async openNftForUsdcAndCheck(
      signer: SignerWithAddress,
      loan: TetuLoans,
      collateralToken: string,
      collateralId: string,
      acquiredAmount: string,
      loanDurationBlocks = 99,
      loanFee = 100,
  ): Promise<number> {
    const id = await LoanUtils.openNftForUsdc(
        signer,
        loan,
        collateralToken,
        collateralId,
        acquiredAmount,
        loanDurationBlocks,
        loanFee
    );

    await LoanTestUtils.checkPosition(
        id,
        signer,
        loan,
        collateralToken,
        "0",
        collateralId,
        1,
        acquiredAmount,
        loanDurationBlocks,
        loanFee,
    )
    return id;
  }

  public static async checkPosition(
      id: number,
      signer: SignerWithAddress,
      loan: TetuLoans,
      collateralToken: string,
      collateralAmount: string,
      collateralId: string,
      collateralType: number,
      acquiredAmount: string,
      loanDurationBlocks: number,
      loanFee: number,
  ) {
    const l = await loan.loans(id);

    expect(l.id.toNumber()).eq(id);
    expect(l.borrower).is.eq(signer.address);

    const info = l.info;
    expect(info.loanDurationBlocks.toNumber()).is.eq(loanDurationBlocks);
    expect(info.loanFee.toNumber()).is.eq(loanFee);
    expect(info.createdBlock.toNumber()).is.not.eq(0);
    expect(info.createdTs.toNumber()).is.not.eq(0);

    const collateral = l.collateral;
    expect(collateral.collateralToken.toLowerCase()).is.eq(collateralToken.toLowerCase());
    expect(collateral.collateralType).is.eq(collateralType);
    expect(collateral.collateralAmount.toString()).is.eq(collateralAmount);
    expect(collateral.collateralTokenId.toString()).is.eq(collateralId);

    const acquired = l.acquired;
    expect(acquired.acquiredToken.toLowerCase()).is.eq(MaticAddresses.USDC_TOKEN);
    expect(acquired.acquiredAmount.toString()).is.eq(acquiredAmount);

    const execution = l.execution;
    expect(execution.lender.toLowerCase()).is.eq(MaticAddresses.ZERO_ADDRESS);
    expect(execution.loanStartBlock).is.eq(0);
    expect(execution.loanStartTs).is.eq(0);


    const listIndex = (await loan.loanIndexes(0, id)).toNumber();
    const cIndex = (await loan.loanIndexes(1, id)).toNumber();
    const aIndex = (await loan.loanIndexes(2, id)).toNumber();
    const bIndex = (await loan.loanIndexes(3, id)).toNumber();

    expect(await loan.loansList(listIndex)).is.eq(id);
    expect((await loan.loansByCollateral(collateralToken, cIndex))).is.eq(id);
    expect((await loan.loansByAcquired(MaticAddresses.USDC_TOKEN, aIndex))).is.eq(id);
    expect((await loan.borrowerPositions(signer.address, bIndex))).is.eq(id);
  }

  public static async closeAndCheck(id: number, signer: SignerWithAddress, loan: TetuLoans): Promise<void> {
    const loanListLength = (await loan.loanListSize()).toNumber();
    const lastLoanId = (await loan.loansList(loanListLength - 1)).toNumber();
    const lastLoanListIndex = (await loan.loanIndexes(0, lastLoanId)).toNumber();
    expect(lastLoanListIndex).is.eq(loanListLength - 1);

    const l = await loan.loans(id);
    const loanListIndex = (await loan.loanIndexes(0, l.id)).toNumber();
    // const dec = await Erc20Utils.decimals(l.collateral.collateralToken);
    const bal = (await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address));

    await LoanUtils.closePosition(id, signer, loan);

    const balAfter = (await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address));
    expect(bal.add(l.collateral.collateralAmount).toString()).is.eq(balAfter.toString());

    const lastLoanListIndexAfter = (await loan.loanIndexes(0, lastLoanId)).toNumber();
    const loanListIndexAfter = (await loan.loanIndexes(0, l.id)).toString();
    expect(loanListIndexAfter).is.eq(LoanUtils.MAX_UINT);
    expect(lastLoanListIndexAfter).is.eq(loanListIndex);
  }

  public static async bidAndCheck(loanId: number, amount: string, signer: SignerWithAddress, loan: TetuLoans) {
    const l = await loan.loans(loanId);
    const aBalanceBefore = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    const cBalanceBefore = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);

    await LoanUtils.bid(loanId, amount, signer, loan);

    const aBalanceAfter = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    expect(aBalanceBefore.sub(aBalanceAfter).toString()).is.eq(amount);

    await LoanTestUtils.checkExecution(loanId, amount, signer.address, loan, cBalanceBefore);
  }

  public static async checkExecution(
      loanId: number,
      amount: string,
      lenderAddress: string,
      loan: TetuLoans,
      cBalanceBefore: BigNumber
  ) {
    const lAfter = await loan.loans(loanId);

    // auction
    if (lAfter.acquired.acquiredAmount.isZero()) {
      const bidIndex = await loan.lenderOpenBids(lenderAddress, loanId);
      expect(bidIndex).is.not.eq(0);
      const bidId = await loan.loanToBidIds(loanId, bidIndex.sub(1));
      expect(bidId).is.not.eq(0);
      const bid = await loan.auctionBids(bidId);

      expect(bid.id).is.eq(bidId);
      expect(bid.loanId).is.eq(loanId);
      expect(bid.lender).is.eq(lenderAddress);
      expect(bid.amount).is.eq(amount);
    } else {
      expect(lAfter.execution.lender.toLowerCase()).is.eq(lenderAddress.toLowerCase());
      expect(lAfter.execution.loanStartBlock).is.not.eq(0);
      expect(lAfter.execution.loanStartTs).is.not.eq(0);
    }


    // instant buy
    if (lAfter.info.loanDurationBlocks.isZero()) {
      const cBalanceAfter = await TokenUtils.balanceOf(lAfter.collateral.collateralToken, lenderAddress);
      if (lAfter.collateral.collateralType === 0) {
        expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(lAfter.collateral.collateralAmount);
      } else {
        expect(cBalanceAfter.sub(cBalanceBefore).toNumber()).is.eq(1);
      }

      expect(lAfter.execution.loanEndTs).is.not.eq(0);
    } else {
      if (!lAfter.acquired.acquiredAmount.isZero()) {
        const lenderIndex = await loan.loanIndexes(4, loanId);
        expect(await loan.lenderPositions(lenderAddress, lenderIndex)).is.eq(loanId);
      }
    }
  }

  public static async claimAndCheck(id: number, signer: SignerWithAddress, loan: TetuLoans) {
    const l = await loan.loans(id);
    const cBalanceBefore = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);

    await LoanUtils.claim(id, signer, loan);

    const lAfter = await loan.loans(id);

    const cBalanceAfter = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);
    if (l.collateral.collateralType === 0) {
      expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(l.collateral.collateralAmount);
    } else {
      expect(cBalanceAfter.sub(cBalanceBefore).toNumber()).is.eq(1);
    }
    expect(lAfter.execution.loanEndTs).is.not.eq(0);
  }

  public static async redeemAndCheck(id: number, signer: SignerWithAddress, loan: TetuLoans) {
    const l = await loan.loans(id);
    const aBalanceBefore = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    const cBalanceBefore = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);
    const toRedeem = await loan.toRedeem(id);

    await LoanUtils.redeem(id, signer, loan);

    const lAfter = await loan.loans(id);

    const aBalanceAfter = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    expect(aBalanceBefore.sub(aBalanceAfter).toString()).is.eq(toRedeem);

    const cBalanceAfter = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);

    if (l.collateral.collateralType === 0) {
      expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(l.collateral.collateralAmount);
    } else {
      expect(cBalanceAfter.sub(cBalanceBefore).toNumber()).is.eq(1);
    }

    expect(lAfter.execution.loanEndTs).is.not.eq(0);
  }

  public static async closeAuctionBidAndCheck(bidId: number, signer: SignerWithAddress, loan: TetuLoans) {
    const bid = await loan.auctionBids(bidId);
    const l = await loan.loans(bid.loanId);
    const aBalanceBefore = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);

    await LoanUtils.closeAuctionBid(bidId, signer, loan);

    const aBalanceAfter = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    expect(aBalanceAfter.sub(aBalanceBefore).toString()).is.eq(bid.amount);

    expect(await loan.lenderOpenBids(bid.lender, l.id)).is.eq(0);
    expect((await loan.auctionBids(bidId)).open).is.false;
  }

  public static async acceptAuctionBidAndCheck(loanId: number, signer: SignerWithAddress, loan: TetuLoans) {
    const l = await loan.loans(loanId);
    const aBalanceBefore = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    const lastBidId = await LoanUtils.lastAuctionBidId(loanId, loan);
    const bid = await loan.auctionBids(lastBidId);
    const cBalanceBefore = await TokenUtils.balanceOf(l.collateral.collateralToken, bid.lender);

    await LoanUtils.acceptAuctionBid(loanId, signer, loan);

    const aBalanceAfter = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    expect(aBalanceAfter.sub(aBalanceBefore).toString()).is.eq(bid.amount);

    expect(await loan.lenderOpenBids(bid.lender, loanId)).is.eq(0);
    expect((await loan.auctionBids(lastBidId)).open).is.false;

    await LoanTestUtils.checkExecution(loanId, bid.amount.toString(), bid.lender, loan, cBalanceBefore);
  }

  public static async getBidIdAndCheck(loanId: number, lenderAddress: string, loan: TetuLoans){
    const bidIndex = await loan.lenderOpenBids(lenderAddress, loanId);
    expect(bidIndex).is.not.eq(0);
    const bidId = await loan.loanToBidIds(loanId, bidIndex.sub(1));
    expect(bidId).is.not.eq(0);
    const bid = await loan.auctionBids(bidId);
    expect(bid.lender).is.eq(lenderAddress);
    return bidId;
  }

}
