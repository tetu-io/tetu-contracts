import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TimeUtils} from "../TimeUtils";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {PawnShopReader, PriceCalculator, TetuPawnShop, TetuProxyGov} from "../../typechain";
import {utils} from "ethers";
import {PawnShopTestUtils} from "../loan/PawnShopTestUtils";
import {Misc} from "../../scripts/utils/tools/Misc";
import {TokenUtils} from "../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

const OPEN_POSITION_COUNT = 3;
const EXECUTED_POSITION_COUNT = 2;

describe("pawnshop reader tests", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let core: CoreContractsWrapper;
  let reader: PawnShopReader;
  let calculator: PriceCalculator;
  let shop: TetuPawnShop;
  let lastLenderBid = 0;
  let usdc: string;
  let networkToken: string;


  before(async function () {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    user1 = (await ethers.getSigners())[1];
    user2 = (await ethers.getSigners())[2];
    core = await DeployerUtils.deployAllCoreContracts(signer);
    const logic = await DeployerUtils.deployContract(signer, "PawnShopReader") as PawnShopReader;
    const proxy = await DeployerUtils.deployContract(
      signer, "TetuProxyGov", logic.address) as TetuProxyGov;
    reader = logic.attach(proxy.address) as PawnShopReader;
    expect(await proxy.implementation()).is.eq(logic.address);

    shop = await DeployerUtils.deployContract(signer, 'TetuPawnShop', signer.address, Misc.ZERO_ADDRESS, core.controller.address) as TetuPawnShop;
    calculator = (await DeployerUtils.deployPriceCalculator(signer, core.controller.address))[0];

    await reader.initialize(core.controller.address, calculator.address, shop.address);
    usdc = await DeployerUtils.getUSDCAddress();
    networkToken = await DeployerUtils.getNetworkTokenAddress();
    await TokenUtils.getToken(usdc, signer.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(usdc, user1.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(usdc, user2.address, utils.parseUnits('100000', 6));
    await TokenUtils.getToken(networkToken, signer.address, utils.parseUnits('10000'));
    await TokenUtils.getToken(networkToken, user1.address, utils.parseUnits('10000'));
    await TokenUtils.getToken(networkToken, user2.address, utils.parseUnits('10000'));

    for (let i = 0; i < EXECUTED_POSITION_COUNT; i++) {
      const posId = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        networkToken,
        '10' + i,
        '555' + i,
        99 + i,
        10 + i
      );
      await PawnShopTestUtils.bidAndCheck(posId, '555' + i, user2, shop);
    }

    for (let i = 0; i < OPEN_POSITION_COUNT; i++) {
      let aAmount = '55' + i;
      if (i % 2 === 0) {
        aAmount = '0';
      }
      const posId = await PawnShopTestUtils.openErc20ForUsdcAndCheck(
        user1,
        shop,
        networkToken,
        '10' + i,
        aAmount,
        99 + i,
        10 + i
      );
      if (aAmount === '0') {
        await PawnShopTestUtils.bidAndCheck(posId, '555' + i, user2, shop);
        lastLenderBid = posId;
      }
    }

  });

  after(async function () {
    await TimeUtils.rollback(snapshot);
  });

  beforeEach(async function () {
    snapshotForEach = await TimeUtils.snapshot();
  });

  afterEach(async function () {
    await TimeUtils.rollback(snapshotForEach);
  });


  it("read all positions", async () => {
    const positions = await reader.positions(0, 1000);
    const allPosSize = await shop.positionCounter();

    let i = 0;
    for (const pos of positions) {
      i++;
      expect(pos.id).is.eq(i);
    }
    expect(positions.length).is.eq(allPosSize.sub(1));
    expect(positions.length).is.eq(OPEN_POSITION_COUNT + EXECUTED_POSITION_COUNT);
  });

  it("read exact position", async () => {
    const positions = await reader.positions(1, 1);
    expect(positions.length).is.eq(1);
    expect(positions[0].id).is.eq(1);
  });

  it("read all open positions", async () => {
    const positions = await reader.openPositions(0, 1000);
    const allPosSize = await shop.openPositionsSize();

    let i = EXECUTED_POSITION_COUNT;
    for (const pos of positions) {
      i++;
      expect(pos.id).is.eq(i);
    }
    expect(positions.length).is.eq(allPosSize);
    expect(positions.length).is.eq(OPEN_POSITION_COUNT);
  });

  it("read exact open positions", async () => {
    const positions = await reader.openPositions(2, 2);
    expect(positions.length).is.eq(1);
    expect(positions[0].id).is.eq(5);
  });

  it("read all positions by collateral", async () => {
    const positions = await reader.positionsByCollateral(networkToken, 0, 1000);
    const allPosSize = await shop.positionsByCollateralSize(networkToken);

    let i = EXECUTED_POSITION_COUNT;
    for (const pos of positions) {
      i++;
      expect(pos.id).is.eq(i);
    }
    expect(positions.length).is.eq(allPosSize);
    expect(positions.length).is.eq(OPEN_POSITION_COUNT);
  });

  it("read exact position by collateral", async () => {
    const positions = await reader.positionsByCollateral(networkToken, 2, 2);
    expect(positions.length).is.eq(1);
    expect(positions[0].id).is.eq(5);
  });

  it("read all positions by acquired", async () => {
    const positions = await reader.positionsByAcquired(usdc, 0, 1000);
    const allPosSize = await shop.positionsByAcquiredSize(usdc);

    let i = EXECUTED_POSITION_COUNT;
    for (const pos of positions) {
      i++;
      expect(pos.id).is.eq(i);
    }
    expect(positions.length).is.eq(allPosSize);
    expect(positions.length).is.eq(OPEN_POSITION_COUNT);
  });

  it("read exact position by acquired", async () => {
    const positions = await reader.positionsByAcquired(usdc, 2, 2);
    expect(positions.length).is.eq(1);
    expect(positions[0].id).is.eq(5);
  });

  it("read all positions by borrower", async () => {
    const positions = await reader.borrowerPositions(user1.address, 0, 1000);
    const allPosSize = await shop.borrowerPositionsSize(user1.address);

    let i = 0;
    for (const pos of positions) {
      i++;
      expect(pos.id).is.eq(i);
    }
    expect(positions.length).is.eq(allPosSize);
    expect(positions.length).is.eq(OPEN_POSITION_COUNT + EXECUTED_POSITION_COUNT);
  });

  it("read exact position by borrower", async () => {
    const positions = await reader.borrowerPositions(user1.address, 1, 1);
    expect(positions.length).is.eq(1);
    expect(positions[0].id).is.eq(2);
  });

  it("read all positions by lender", async () => {
    const positions = await reader.lenderPositions(user2.address, 0, 1000);
    const allPosSize = await shop.lenderPositionsSize(user2.address);

    let i = 0;
    for (const pos of positions) {
      i++;
      expect(pos.id).is.eq(i);
    }
    expect(positions.length).is.eq(allPosSize);
    expect(positions.length).is.eq(EXECUTED_POSITION_COUNT);
  });

  it("read exact position by lender", async () => {
    const positions = await reader.lenderPositions(user2.address, 1, 1);
    expect(positions.length).is.eq(1);
    expect(positions[0].id).is.eq(2);
  });

  it("read all auction bids", async () => {
    const positions = await reader.auctionBids(0, 1000);
    const allPosSize = await shop.auctionBidCounter();
    console.log('positions', positions)
    console.log('allPosSize', allPosSize)
    let i = 0;
    for (const pos of positions) {
      i++;
      expect(pos.id).is.eq(i);
    }
    expect(positions.length).is.eq(allPosSize.sub(1));
    expect(positions.length).is.eq(Math.floor(OPEN_POSITION_COUNT / 2) + 1);
  });

  it("read exact auction bid", async () => {
    const positions = await reader.auctionBids(1, 1);
    expect(positions.length).is.eq(1);
    expect(positions[0].id).is.eq(1);
  });

  it("read exact lender auction bid", async () => {
    const bid = await reader.lenderAuctionBid(user2.address, lastLenderBid);
    expect(bid.posId).is.eq(lastLenderBid);
  });

  it("read pos auc bids", async () => {
    const bids = await reader.positionAuctionBids(lastLenderBid, 0, 1000);
    expect(bids.length).is.eq(1);
    expect(bids[0].posId).is.eq(lastLenderBid);
  });

});
