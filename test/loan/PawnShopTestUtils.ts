import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TetuPawnShop} from "../../typechain";
import {PawnShopUtils} from "./PawnShopUtils";
import {MaticAddresses} from "../MaticAddresses";
import {TokenUtils} from "../TokenUtils";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {BigNumber} from "ethers";

const {expect} = chai;
chai.use(chaiAsPromised);

export class PawnShopTestUtils {


  public static async openErc20ForUsdcAndCheck(
      signer: SignerWithAddress,
      shop: TetuPawnShop,
      collateralToken: string,
      collateralAmount: string,
      acquiredAmount: string,
      posDurationBlocks = 99,
      posFee = 100,
  ): Promise<number> {
    const id = await PawnShopUtils.openErc20ForUsdc(
        signer,
        shop,
        collateralToken,
        collateralAmount,
        acquiredAmount,
        posDurationBlocks,
        posFee
    );

    await PawnShopTestUtils.checkPosition(
        id,
        signer,
        shop,
        collateralToken,
        collateralAmount,
        "0",
        0,
        acquiredAmount,
        posDurationBlocks,
        posFee,
    )
    return id;
  }

  public static async openNftForUsdcAndCheck(
      signer: SignerWithAddress,
      shop: TetuPawnShop,
      collateralToken: string,
      collateralId: string,
      acquiredAmount: string,
      posDurationBlocks = 99,
      posFee = 100,
  ): Promise<number> {
    const id = await PawnShopUtils.openNftForUsdc(
        signer,
        shop,
        collateralToken,
        collateralId,
        acquiredAmount,
        posDurationBlocks,
        posFee
    );

    await PawnShopTestUtils.checkPosition(
        id,
        signer,
        shop,
        collateralToken,
        "0",
        collateralId,
        1,
        acquiredAmount,
        posDurationBlocks,
        posFee,
    )
    return id;
  }

  public static async checkPosition(
      id: number,
      signer: SignerWithAddress,
      shop: TetuPawnShop,
      collateralToken: string,
      collateralAmount: string,
      collateralId: string,
      collateralType: number,
      acquiredAmount: string,
      posDurationBlocks: number,
      posFee: number,
  ) {
    const l = await shop.positions(id);

    expect(l.id.toNumber()).eq(id);
    expect(l.borrower).is.eq(signer.address);

    const info = l.info;
    expect(info.posDurationBlocks.toNumber()).is.eq(posDurationBlocks);
    expect(info.posFee.toNumber()).is.eq(posFee);
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
    expect(execution.posStartBlock).is.eq(0);
    expect(execution.posStartTs).is.eq(0);


    const listIndex = (await shop.posIndexes(0, id)).toNumber();
    const cIndex = (await shop.posIndexes(1, id)).toNumber();
    const aIndex = (await shop.posIndexes(2, id)).toNumber();
    const bIndex = (await shop.posIndexes(3, id)).toNumber();

    expect(await shop.openPositions(listIndex)).is.eq(id);
    expect((await shop.positionsByCollateral(collateralToken, cIndex))).is.eq(id);
    expect((await shop.positionsByAcquired(MaticAddresses.USDC_TOKEN, aIndex))).is.eq(id);
    expect((await shop.borrowerPositions(signer.address, bIndex))).is.eq(id);
  }

  public static async closeAndCheck(id: number, signer: SignerWithAddress, shop: TetuPawnShop): Promise<void> {
    const posListLength = (await shop.openPositionsSize()).toNumber();
    const lastLoanId = (await shop.openPositions(posListLength - 1)).toNumber();
    const lastLoanListIndex = (await shop.posIndexes(0, lastLoanId)).toNumber();
    expect(lastLoanListIndex).is.eq(posListLength - 1);

    const pos = await shop.positions(id);
    const loanListIndex = (await shop.posIndexes(0, pos.id)).toString();
    const bal = (await TokenUtils.balanceOf(pos.collateral.collateralToken, signer.address));

    await PawnShopUtils.closePosition(id, signer, shop);

    const posAfter = await shop.positions(id);

    const balAfter = (await TokenUtils.balanceOf(pos.collateral.collateralToken, signer.address));
    expect(bal.add(pos.collateral.collateralAmount).toString()).is.eq(balAfter.toString());

    const lastLoanListIndexAfter = (await shop.posIndexes(0, lastLoanId)).toString();
    const loanListIndexAfter = (await shop.posIndexes(0, pos.id)).toString();
    expect(loanListIndexAfter).is.eq(PawnShopUtils.MAX_UINT);
    if (posListLength > 1) {
      expect(lastLoanListIndexAfter).is.eq(loanListIndex);
    }
    expect(posAfter.open).is.eq(false);
  }

  public static async bidAndCheck(loanId: number, amount: string, signer: SignerWithAddress, shop: TetuPawnShop) {
    const l = await shop.positions(loanId);
    const aBalanceBefore = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    const cBalanceBefore = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);

    await PawnShopUtils.bid(loanId, amount, signer, shop);

    const aBalanceAfter = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    expect(aBalanceBefore.sub(aBalanceAfter).toString()).is.eq(amount);

    await PawnShopTestUtils.checkExecution(loanId, amount, signer.address, shop, cBalanceBefore);
  }

  public static async checkExecution(
      loanId: number,
      amount: string,
      lenderAddress: string,
      shop: TetuPawnShop,
      cBalanceBefore: BigNumber
  ) {
    const lAfter = await shop.positions(loanId);

    // auction
    if (lAfter.acquired.acquiredAmount.isZero()) {
      const bidIndex = await shop.lenderOpenBids(lenderAddress, loanId);
      expect(bidIndex).is.not.eq(0);
      const bidId = await shop.positionToBidIds(loanId, bidIndex.sub(1));
      expect(bidId).is.not.eq(0);
      const bid = await shop.auctionBids(bidId);

      expect(bid.id).is.eq(bidId);
      expect(bid.posId).is.eq(loanId);
      expect(bid.lender).is.eq(lenderAddress);
      expect(bid.amount).is.eq(amount);
    } else {
      expect(lAfter.execution.lender.toLowerCase()).is.eq(lenderAddress.toLowerCase());
      expect(lAfter.execution.posStartBlock).is.not.eq(0);
      expect(lAfter.execution.posStartTs).is.not.eq(0);
    }


    // instant buy and not auction bid
    if (lAfter.info.posDurationBlocks.isZero() && !lAfter.acquired.acquiredAmount.isZero()) {
      const cBalanceAfter = await TokenUtils.balanceOf(lAfter.collateral.collateralToken, lenderAddress);
      if (lAfter.collateral.collateralType === 0) {
        expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(lAfter.collateral.collateralAmount);
      } else {
        expect(cBalanceAfter.sub(cBalanceBefore).toNumber()).is.eq(1);
      }

      expect(lAfter.execution.posEndTs).is.not.eq(0);
    } else {
      if (!lAfter.acquired.acquiredAmount.isZero()) {
        const lenderIndex = await shop.posIndexes(4, loanId);
        expect(await shop.lenderPositions(lenderAddress, lenderIndex)).is.eq(loanId);
      }
    }
  }

  public static async claimAndCheck(id: number, signer: SignerWithAddress, shop: TetuPawnShop) {
    const l = await shop.positions(id);
    const cBalanceBefore = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);

    await PawnShopUtils.claim(id, signer, shop);

    const lAfter = await shop.positions(id);

    const cBalanceAfter = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);
    if (l.collateral.collateralType === 0) {
      expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(l.collateral.collateralAmount);
    } else {
      expect(cBalanceAfter.sub(cBalanceBefore).toNumber()).is.eq(1);
    }
    expect(lAfter.execution.posEndTs).is.not.eq(0);
  }

  public static async redeemAndCheck(id: number, signer: SignerWithAddress, shop: TetuPawnShop) {
    const l = await shop.positions(id);
    const aBalanceBefore = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    const cBalanceBefore = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);
    const toRedeem = await shop.toRedeem(id);

    await PawnShopUtils.redeem(id, signer, shop);

    const lAfter = await shop.positions(id);

    const aBalanceAfter = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    expect(aBalanceBefore.sub(aBalanceAfter).toString()).is.eq(toRedeem);

    const cBalanceAfter = await TokenUtils.balanceOf(l.collateral.collateralToken, signer.address);

    if (l.collateral.collateralType === 0) {
      expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(l.collateral.collateralAmount);
    } else {
      expect(cBalanceAfter.sub(cBalanceBefore).toNumber()).is.eq(1);
    }

    expect(lAfter.execution.posEndTs).is.not.eq(0);
  }

  public static async closeAuctionBidAndCheck(bidId: number, signer: SignerWithAddress, shop: TetuPawnShop) {
    const bid = await shop.auctionBids(bidId);
    const l = await shop.positions(bid.posId);
    const aBalanceBefore = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);

    await PawnShopUtils.closeAuctionBid(bidId, signer, shop);

    const aBalanceAfter = await TokenUtils.balanceOf(l.acquired.acquiredToken, signer.address);
    expect(aBalanceAfter.sub(aBalanceBefore).toString()).is.eq(bid.amount);

    expect(await shop.lenderOpenBids(bid.lender, l.id)).is.eq(0);
    expect((await shop.auctionBids(bidId)).open).is.eq(false);
  }

  public static async acceptAuctionBidAndCheck(loanId: number, signer: SignerWithAddress, shop: TetuPawnShop) {
    const l = await shop.positions(loanId);
    const aBalanceBefore = await TokenUtils.balanceOf(l.acquired.acquiredToken, shop.address);
    const lastBidId = await PawnShopUtils.lastAuctionBidId(loanId, shop);
    const bid = await shop.auctionBids(lastBidId);
    const cBalanceBefore = await TokenUtils.balanceOf(l.collateral.collateralToken, bid.lender);

    await PawnShopUtils.acceptAuctionBid(loanId, signer, shop);

    const aBalanceAfter = await TokenUtils.balanceOf(l.acquired.acquiredToken, shop.address);
    expect(aBalanceBefore.sub(aBalanceAfter).toString()).is.eq(bid.amount);

    expect(await shop.lenderOpenBids(bid.lender, loanId)).is.eq(0);
    expect((await shop.auctionBids(lastBidId)).open).is.eq(false);

    await PawnShopTestUtils.checkExecution(loanId, bid.amount.toString(), bid.lender, shop, cBalanceBefore);
  }

  public static async getBidIdAndCheck(loanId: number, lenderAddress: string, shop: TetuPawnShop) {
    const bidIndex = await shop.lenderOpenBids(lenderAddress, loanId);
    expect(bidIndex).is.not.eq(0);
    const bidId = await shop.positionToBidIds(loanId, bidIndex.sub(1));
    expect(bidId).is.not.eq(0);
    const bid = await shop.auctionBids(bidId);
    expect(bid.lender).is.eq(lenderAddress);
    return bidId;
  }

}
