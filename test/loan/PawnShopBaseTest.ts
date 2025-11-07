import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {MockNFT, TetuPawnShop} from "../../typechain";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {TokenUtils} from "../TokenUtils";
import {PawnShopTestUtils} from "./PawnShopTestUtils";
import {MintHelperUtils} from "../MintHelperUtils";
import {parseUnits} from "ethers/lib/utils";
import {PawnShopUtils} from "./PawnShopUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu pawnshop base tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let core: CoreContractsWrapper;
  let shop: TetuPawnShop;
  let nft: MockNFT;
  let usdc: string;
  let networkToken: string;

  before(async function () {
    signer = await DeployerUtils.impersonate();
    user1 = (await ethers.getSigners())[1];
    user2 = (await ethers.getSigners())[2];
    user3 = (await ethers.getSigners())[3];
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);
    snapshotBefore = await TimeUtils.snapshot();

    shop = await DeployerUtils.deployContract(signer, 'TetuPawnShop',
      signer.address,
      core.rewardToken.address,
      parseUnits('1000'),
      core.controller.address,
    ) as TetuPawnShop;
    nft = await DeployerUtils.deployContract(signer, 'MockNFT') as MockNFT;

    await shop.announceGovernanceAction(4, core.rewardToken.address, 0);
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 48);
    await shop.setPositionDepositToken(core.rewardToken.address);

    // await StrategyTestUtils.initForwarder(core.feeRewardForwarder);

    await nft.mint(user1.address);
    await nft.mint(user1.address);
    await nft.mint(user2.address);

    usdc = (await DeployerUtils.deployMockToken(signer, 'USDC', 6)).address.toLowerCase();
    networkToken = (await DeployerUtils.deployMockToken(signer, 'WETH')).address.toLowerCase();
    // await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('10000', 6));
    await TokenUtils.getToken(usdc, user1.address, utils.parseUnits('10000', 6));
    await TokenUtils.getToken(usdc, user2.address, utils.parseUnits('10000', 6));
    await TokenUtils.getToken(usdc, user3.address, utils.parseUnits('10000', 6));
    // await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('1000'));
    await TokenUtils.getToken(networkToken, user1.address, utils.parseUnits('1000'));
    await TokenUtils.getToken(networkToken, user2.address, utils.parseUnits('1000'));
    await TokenUtils.getToken(networkToken, user3.address, utils.parseUnits('1000'));

    const uniData = await UniswapUtils.deployUniswap(signer);
    const factory = uniData.factory.address;
    const router = uniData.router.address;

    await MintHelperUtils.mint(core.controller, core.announcer, '100000', user1.address);
    await MintHelperUtils.mint(core.controller, core.announcer, '100000', signer.address)
    await UniswapUtils.addLiquidity(
      signer,
      core.rewardToken.address,
      usdc,
      utils.parseUnits('50', 18).toString(),
      utils.parseUnits('255', 6).toString(),
      factory,
      router,
    );
    await TokenUtils.approve(core.rewardToken.address, user1, shop.address, utils.parseUnits('10000').toString());
  });

  after(async function () {
    await TimeUtils.rollback(snapshotBefore);
  });


  beforeEach(async function () {
    snapshot = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshot);
  });

  it("open multiple positions with close", async () => {
    const collateralToken = networkToken;

    for (let i = 0; i < 3; i++) {
      await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        usdc,
        user1,
        shop,
        collateralToken,
        '10' + i,
        '555' + i,
        99 + i,
        10 + i
      );

      if (i !== 0 && i % 2 === 0) {
        await PawnShopTestUtils.closeAndCheck(i - 1, user1, shop);
      }
    }
  });

  it("bid on position with instant execution", async () => {
    const collateralToken = networkToken;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      collateralToken,
      utils.parseUnits('10').toString(),
      acquiredAmount,
      0,
      0
    );

    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop)
  });

  it("bid on position and claim", async () => {
    const collateralToken = networkToken;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      collateralToken,
      '10',
      acquiredAmount,
      1,
      0
    );

    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop);
    await TimeUtils.advanceNBlocks(2);
    await PawnShopTestUtils.claimAndCheck(id, user2, shop);
  });

  it("open position and redeem", async () => {
    const collateralToken = networkToken;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      collateralToken,
      '10',
      acquiredAmount,
      1,
      0
    );
    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop);
    await PawnShopTestUtils.redeemAndCheck(id, user1, shop);
  });

  it("start auction and claim", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      networkToken,
      '10',
      '0',
      1,
      0
    );

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    await TokenUtils.approve(usdc, user3, shop.address, '555');
    await expect(shop.connect(user3).bid(id, '555')).rejectedWith('TPS: New bid lower than previous');

    await PawnShopTestUtils.bidAndCheck(id, '5560', user3, shop);

    const bidId2 = await PawnShopTestUtils.getBidIdAndCheck(id, user2.address, shop);
    const bidId3 = await PawnShopTestUtils.getBidIdAndCheck(id, user3.address, shop);

    await expect(shop.connect(user3).closeAuctionBid(bidId3)).rejectedWith("TPS: Auction is not ended");

    await PawnShopTestUtils.closeAuctionBidAndCheck(bidId2.toNumber(), user2, shop)

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.acceptAuctionBidAndCheck(id, user1, shop);

    await TimeUtils.advanceNBlocks(2);

    await PawnShopTestUtils.claimAndCheck(id, user3, shop);
  });

  it("start auction and redeem", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      networkToken,
      '10',
      '0',
      1,
      0
    );

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.acceptAuctionBidAndCheck(id, user1, shop);

    await PawnShopTestUtils.redeemAndCheck(id, user1, shop);
  });

  it("start auction and close", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      networkToken,
      '10',
      '0',
      1,
      0
    );

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    const bidId2 = await PawnShopTestUtils.getBidIdAndCheck(id, user2.address, shop);

    await PawnShopTestUtils.closeAndCheck(id, user1, shop);

    await PawnShopTestUtils.closeAuctionBidAndCheck(bidId2.toNumber(), user2, shop)
  });

  it("start auction with instant deal", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      networkToken,
      '10',
      '0',
      0,
      0
    );

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.acceptAuctionBidAndCheck(id, user1, shop);
  });

  it("should be able to close losing bets", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      networkToken,
      '10',
      '0',
      0,
      0
    );

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);
    await PawnShopTestUtils.bidAndCheck(id, '5560', user3, shop);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    const bidId2 = (await PawnShopTestUtils.getBidIdAndCheck(id, user2.address, shop)).toNumber();
    const bidId3 = (await PawnShopTestUtils.getBidIdAndCheck(id, user3.address, shop)).toNumber();

    const balanceBefore = await TokenUtils.balanceOf(networkToken, user3.address);
    await PawnShopTestUtils.acceptAuctionBidAndCheck(id, user1, shop);
    const balanceAfter = await TokenUtils.balanceOf(networkToken, user3.address);

    // user 3 won, he received the collateral
    expect(balanceAfter).gt(balanceBefore);
    // .. so, user 3 is not able to take his acquired tokens back
    await expect(PawnShopUtils.closeAuctionBid(bidId3, user3, shop)).rejectedWith("TPS: Bid closed");

    // user 2 lost, he can take his acquired tokens back (without platform fee)
    await PawnShopUtils.closeAuctionBid(bidId2, user2, shop);
  });

  it("should revert if try to call closeAuctionBid second time", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      networkToken,
      '10',
      '0',
      1,
      0
    );

    // user 2 makes a bid
    const balanceBefore = await TokenUtils.balanceOf(usdc, user2.address);
    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);
    const balanceAfterBid = await TokenUtils.balanceOf(usdc, user2.address);

    // user 3 makes a second bid
    await TokenUtils.approve(usdc, user3, shop.address, '555');
    await expect(shop.connect(user3).bid(id, '555')).rejectedWith('TPS: New bid lower than previous');

    await PawnShopTestUtils.bidAndCheck(id, '5560', user3, shop);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);
    // auction is closed

    const bidId2 = (await PawnShopTestUtils.getBidIdAndCheck(id, user2.address, shop)).toNumber();

    // user 2 closes the bid
    await PawnShopUtils.closeAuctionBid(bidId2, user2, shop);
    const balanceAfterClose = await TokenUtils.balanceOf(usdc, user2.address);

    expect(balanceAfterBid).eq(balanceBefore.sub(555));
    expect(balanceAfterClose).eq(balanceBefore);

    // user 2 tries to close the same bid second time
    await expect(PawnShopUtils.closeAuctionBid(bidId2, user2, shop)).rejectedWith("TPS: Bid closed");
  });

  it("should revert if not lender tries to call closeAuctionBid", async () => {

    const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
      usdc,
      user1,
      shop,
      networkToken,
      '10',
      '0',
      1,
      0
    );

    // user 2 makes a bid
    await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);

    // user 3 makes a second bid, so bid of user 2 is closable now
    await TokenUtils.approve(usdc, user3, shop.address, '555');
    await expect(shop.connect(user3).bid(id, '555')).rejectedWith('TPS: New bid lower than previous');

    await PawnShopTestUtils.bidAndCheck(id, '5560', user3, shop);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 16); // 2 days + 2 weeks has passed
    // auction is closed

    const bidId2 = (await PawnShopTestUtils.getBidIdAndCheck(id, user2.address, shop)).toNumber();
    const bidId3 = (await PawnShopTestUtils.getBidIdAndCheck(id, user3.address, shop)).toNumber();

    // ensure that users are not able to close bids of the other users
    await expect(PawnShopUtils.closeAuctionBid(bidId3, user2, shop)).rejectedWith("TPS: Not lender");
    await expect(PawnShopUtils.closeAuctionBid(bidId2, user3, shop)).rejectedWith("TPS: Not lender");

    await PawnShopUtils.closeAuctionBid(bidId2, user2, shop); // correct
    await PawnShopUtils.closeAuctionBid(bidId3, user3, shop); // correct
  });

  describe("Attempts to use 'dead' auction", () => {

    it("should be able to exit from auction that don't have any actions long time", async () => {
      const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        usdc,
        user1,
        shop,
        networkToken,
        '10',
        '0',
        1,
        0
      );

      // auction is not used for long time
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 3); // 3 days

      // user 2 accidentally makes a bid and wants to go away immediately .. it's not allowed
      await PawnShopTestUtils.bidAndCheck(id, '555', user2, shop);
      const bidId2 = (await PawnShopTestUtils.getBidIdAndCheck(id, user2.address, shop)).toNumber();
      await expect(PawnShopUtils.closeAuctionBid(bidId2, user2, shop)).rejectedWith("TPS: Auction is not ended");

      // user 2 waits 1 day for the end of the auction
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24); // 1 day

      // now he is able to go away
      await PawnShopUtils.closeAuctionBid(bidId2, user2, shop);
    })

    it("should not be able to make a new bid in the auction with accepted bid", async () => {
      const id = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        usdc,
        user1,
        shop,
        networkToken,
        '10',
        '0',
        1,
        0
      );

      // user 3 makes a bid
      await PawnShopTestUtils.bidAndCheck(id, '555', user3, shop);

      // auction is ended
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24); // 1 days

      // user 1 accepts the winner bid
      await PawnShopTestUtils.acceptAuctionBidAndCheck(id, user1, shop);

      // then no actions happens for long time
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 3); // 3 days

      // user 2 accidentally tries to make a bid ... it's not allowed
      await expect(PawnShopTestUtils.bidAndCheck(id, '5556', user2, shop)).rejectedWith("TPS: Can't bid executed position");
    })
  });

  // ! ** NFT **************

  it("NFT bid on position with instant execution", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openNftForUsdcAndCheck(
      usdc,
      user1,
      shop,
      nft.address,
      '1',
      acquiredAmount,
      0,
      0
    );

    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop)
  });

  it("NFT bid on position and claim", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openNftForUsdcAndCheck(
      usdc,
      user1,
      shop,
      nft.address,
      '1',
      acquiredAmount,
      1,
      0
    );

    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop);
    await TimeUtils.advanceNBlocks(2);
    await PawnShopTestUtils.claimAndCheck(id, user2, shop);
  });

  it("NFT open position and redeem", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await PawnShopTestUtils.openNftForUsdcAndCheck(
      usdc,
      user1,
      shop,
      nft.address,
      '1',
      acquiredAmount,
      1,
      0
    );
    await PawnShopTestUtils.bidAndCheck(id, acquiredAmount, user2, shop);
    await PawnShopTestUtils.redeemAndCheck(id, user1, shop);
  });

});
