import { TokenUtils } from "../TokenUtils";
import { TetuPawnShop } from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { utils } from "ethers";
import { DeployerUtils } from "../../scripts/deploy/DeployerUtils";

const { expect } = chai;
chai.use(chaiAsPromised);

export class PawnShopUtils {
  public static MAX_UINT =
    "115792089237316195423570985008687907853269984665640564039457584007913129639935";

  public static async openErc20ForUsdc(
    signer: SignerWithAddress,
    shop: TetuPawnShop,
    collateralToken: string,
    collateralAmount: string,
    acquiredAmount: string,
    posDurationBlocks = 99,
    posFee = 100
  ): Promise<number> {
    console.log("Try to open erc20 position for usdc");
    const bal = await TokenUtils.balanceOf(collateralToken, signer.address);
    const dec = await TokenUtils.decimals(collateralToken);
    expect(+utils.formatUnits(bal, dec)).is.greaterThanOrEqual(
      +utils.formatUnits(collateralAmount, dec),
      "not enough balance for open position"
    );

    await TokenUtils.approve(
      collateralToken,
      signer,
      shop.address,
      collateralAmount
    );
    await shop
      .connect(signer)
      .openPosition(
        collateralToken,
        collateralAmount,
        0,
        await DeployerUtils.getUSDCAddress(),
        acquiredAmount,
        posDurationBlocks,
        posFee
      );
    const id = (await shop.positionCounter()).toNumber() - 1;
    console.log("Position opened", id);
    return id;
  }

  public static async openNftForUsdc(
    signer: SignerWithAddress,
    shop: TetuPawnShop,
    collateralToken: string,
    collateralId: string,
    acquiredAmount: string,
    posDurationBlocks = 99,
    posFee = 100
  ): Promise<number> {
    console.log("Try to open NFT position for usdc", collateralId);

    await TokenUtils.approveNFT(
      collateralToken,
      signer,
      shop.address,
      collateralId
    );
    await shop
      .connect(signer)
      .openPosition(
        collateralToken,
        0,
        collateralId,
        await DeployerUtils.getUSDCAddress(),
        acquiredAmount,
        posDurationBlocks,
        posFee
      );
    const id = (await shop.positionCounter()).toNumber() - 1;
    console.log("NFT Position opened", id);
    return id;
  }

  public static async closePosition(
    id: number,
    signer: SignerWithAddress,
    shop: TetuPawnShop
  ): Promise<void> {
    console.log("Try to close position", id);
    await shop.connect(signer).closePosition(id);
  }

  public static async bid(
    id: number,
    amount: string,
    signer: SignerWithAddress,
    shop: TetuPawnShop
  ) {
    console.log("Try to bid on position", id, amount);
    const l = await shop.positions(id);
    const aToken = l.acquired.acquiredToken;
    await TokenUtils.approve(aToken, signer, shop.address, amount);
    await shop.connect(signer).bid(id, amount);
  }

  public static async claim(
    id: number,
    signer: SignerWithAddress,
    shop: TetuPawnShop
  ) {
    console.log("Try to claim on position", id);
    await shop.connect(signer).claim(id);
  }

  public static async redeem(
    id: number,
    signer: SignerWithAddress,
    shop: TetuPawnShop
  ) {
    console.log("Try to redeem on position", id);
    const l = await shop.positions(id);
    const aToken = l.acquired.acquiredToken;
    const toRedeem = await shop.toRedeem(id);
    await TokenUtils.approve(aToken, signer, shop.address, toRedeem.toString());
    await shop.connect(signer).redeem(id);
  }

  public static async closeAuctionBid(
    bidId: number,
    signer: SignerWithAddress,
    shop: TetuPawnShop
  ) {
    console.log("Try to close auction bid", bidId);
    await shop.connect(signer).closeAuctionBid(bidId);
  }

  public static async acceptAuctionBid(
    posId: number,
    signer: SignerWithAddress,
    shop: TetuPawnShop
  ) {
    console.log("Try to accept auction bid for loanId", posId);
    await shop.connect(signer).acceptAuctionBid(posId);
  }

  public static async lastAuctionBidId(posId: number, shop: TetuPawnShop) {
    const size = (await shop.auctionBidSize(posId)).toNumber();
    console.log("auction bids size", size);
    expect(size).is.not.eq(0, "no bids for " + posId);
    return (await shop.positionToBidIds(posId, size - 1)).toNumber();
  }
}
