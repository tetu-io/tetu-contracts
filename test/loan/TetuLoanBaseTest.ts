import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {MockNFT, TetuLoans} from "../../typechain";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {utils} from "ethers";
import {TokenUtils} from "../TokenUtils";
import {LoanTestUtils} from "./LoanTestUtils";
import {MintHelperUtils} from "../MintHelperUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu loans base tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let core: CoreContractsWrapper;
  let loan: TetuLoans;
  let nft: MockNFT;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    user1 = (await ethers.getSigners())[1];
    user2 = (await ethers.getSigners())[2];
    user3 = (await ethers.getSigners())[3];
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);

    loan = await DeployerUtils.deployContract(signer, 'TetuLoans', core.controller.address) as TetuLoans;
    nft = await DeployerUtils.deployContract(signer, 'MockNFT') as MockNFT;


    await core.feeRewardForwarder.setConversionPath(
        [MaticAddresses.USDC_TOKEN, core.rewardToken.address],
        [MaticAddresses.QUICK_ROUTER]
    );

    await nft.mint(user1.address);
    await nft.mint(user1.address);
    await nft.mint(user2.address);

    await UniswapUtils.buyToken(user1, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
    await UniswapUtils.buyToken(user1, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));
    await UniswapUtils.buyToken(user2, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
    await UniswapUtils.buyToken(user2, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));
    await UniswapUtils.buyToken(user3, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
    await UniswapUtils.buyToken(user3, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));

    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000'));
    await UniswapUtils.buyToken(signer, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000'));
    await MintHelperUtils.mint(core.controller, core.announcer, '100', signer.address)
    return await UniswapUtils.addLiquidity(
        signer,
        core.rewardToken.address,
        MaticAddresses.USDC_TOKEN,
        utils.parseUnits('50', 18).toString(),
        utils.parseUnits('255', 6).toString(),
        MaticAddresses.QUICK_FACTORY,
        MaticAddresses.QUICK_ROUTER
    );
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

  it("open max positions with closes", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const max = (await loan.MAX_POSITIONS_PER_USER()).toNumber();
    console.log('max position: ' + max);
    for (let i = 0; i < max + 5; i++) {
      await LoanTestUtils.openErc20ForUsdcAndCheck(
          user1,
          loan,
          collateralToken,
          '10' + i,
          '555' + i,
          99 + i,
          10 + i
      );

      if (i !== 0 && i % 3 === 0) {
        await LoanTestUtils.closeAndCheck(i - 2, user1, loan);
      }
    }

    await TokenUtils.approve(collateralToken, user1, loan.address, '10');
    await expect(loan.connect(user1).openPosition(
        collateralToken,
        '10',
        0,
        MaticAddresses.USDC_TOKEN,
        '55',
        99,
        100
    )).rejectedWith('TL: Too many positions');

  });

  it("bid on position with instant execution", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await LoanTestUtils.openErc20ForUsdcAndCheck(
        user1,
        loan,
        collateralToken,
        utils.parseUnits('10').toString(),
        acquiredAmount,
        0,
        0
    );

    await LoanTestUtils.bidAndCheck(id, acquiredAmount, user2, loan)
  });

  it("bid on position and claim", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await LoanTestUtils.openErc20ForUsdcAndCheck(
        user1,
        loan,
        collateralToken,
        '10',
        acquiredAmount,
        1,
        0
    );

    await LoanTestUtils.bidAndCheck(id, acquiredAmount, user2, loan);
    await TimeUtils.advanceNBlocks(2);
    await LoanTestUtils.claimAndCheck(id, user2, loan);
  });

  it("open position and redeem", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await LoanTestUtils.openErc20ForUsdcAndCheck(
        user1,
        loan,
        collateralToken,
        '10',
        acquiredAmount,
        1,
        0
    );
    await LoanTestUtils.bidAndCheck(id, acquiredAmount, user2, loan);
    await LoanTestUtils.redeemAndCheck(id, user1, loan);
  });

  it("start auction and claim", async () => {

    const id = await LoanTestUtils.openErc20ForUsdcAndCheck(
        user1,
        loan,
        MaticAddresses.WMATIC_TOKEN,
        '10',
        '0',
        1,
        0
    );

    await LoanTestUtils.bidAndCheck(id, '555', user2, loan);

    await TokenUtils.approve(MaticAddresses.USDC_TOKEN, user3, loan.address, '555');
    await expect(loan.connect(user3).bid(id, '555')).rejectedWith('TL: New bid lower than previous');

    await LoanTestUtils.bidAndCheck(id, '556', user3, loan);

    const bidId2 = await LoanTestUtils.getBidIdAndCheck(id, user2.address, loan);
    const bidId3 = await LoanTestUtils.getBidIdAndCheck(id, user3.address, loan);

    await expect(loan.connect(user3).closeAuctionBid(bidId3)).rejectedWith("TL: Auction is not ended");

    await LoanTestUtils.closeAuctionBidAndCheck(bidId2.toNumber(), user2, loan)

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await LoanTestUtils.acceptAuctionBidAndCheck(id, user1, loan);

    await TimeUtils.advanceNBlocks(2);

    await LoanTestUtils.claimAndCheck(id, user3, loan);
  });

  it("start auction and redeem", async () => {

    const id = await LoanTestUtils.openErc20ForUsdcAndCheck(
        user1,
        loan,
        MaticAddresses.WMATIC_TOKEN,
        '10',
        '0',
        1,
        0
    );

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await LoanTestUtils.bidAndCheck(id, '555', user2, loan);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await LoanTestUtils.acceptAuctionBidAndCheck(id, user1, loan);

    await LoanTestUtils.redeemAndCheck(id, user1, loan);
  });

  it("start auction with instant deal", async () => {

    const id = await LoanTestUtils.openErc20ForUsdcAndCheck(
        user1,
        loan,
        MaticAddresses.WMATIC_TOKEN,
        '10',
        '0',
        0,
        0
    );

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await LoanTestUtils.bidAndCheck(id, '555', user2, loan);

    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 2);

    await LoanTestUtils.acceptAuctionBidAndCheck(id, user1, loan);
  });

  // ! ** NFT **************

  it("NFT bid on position with instant execution", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await LoanTestUtils.openNftForUsdcAndCheck(
        user1,
        loan,
        nft.address,
        '1',
        acquiredAmount,
        0,
        0
    );

    await LoanTestUtils.bidAndCheck(id, acquiredAmount, user2, loan)
  });

  it("NFT bid on position and claim", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await LoanTestUtils.openNftForUsdcAndCheck(
        user1,
        loan,
        nft.address,
        '1',
        acquiredAmount,
        1,
        0
    );

    await LoanTestUtils.bidAndCheck(id, acquiredAmount, user2, loan);
    await TimeUtils.advanceNBlocks(2);
    await LoanTestUtils.claimAndCheck(id, user2, loan);
  });

  it("NFT open position and redeem", async () => {
    const acquiredAmount = utils.parseUnits('55', 6).toString();
    const id = await LoanTestUtils.openNftForUsdcAndCheck(
        user1,
        loan,
        nft.address,
        '1',
        acquiredAmount,
        1,
        0
    );
    await LoanTestUtils.bidAndCheck(id, acquiredAmount, user2, loan);
    await LoanTestUtils.redeemAndCheck(id, user1, loan);
  });

});
