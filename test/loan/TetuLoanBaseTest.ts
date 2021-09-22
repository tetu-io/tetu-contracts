import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {TimeUtils} from "../TimeUtils";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TetuLoans} from "../../typechain";
import {MaticAddresses} from "../MaticAddresses";
import {UniswapUtils} from "../UniswapUtils";
import {BigNumber, utils} from "ethers";
import {LoanUtils} from "./LoanUtils";
import {Erc20Utils} from "../Erc20Utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Tetu loans base tests", function () {
  let snapshotBefore: string;
  let snapshot: string;
  let signer: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let core: CoreContractsWrapper;
  let loan: TetuLoans;

  before(async function () {
    snapshotBefore = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    user1 = (await ethers.getSigners())[1];
    user2 = (await ethers.getSigners())[2];
    core = await DeployerUtils.deployAllCoreContracts(signer, 1, 1);

    loan = await DeployerUtils.deployContract(signer, 'TetuLoans', core.controller.address) as TetuLoans;

    await UniswapUtils.buyToken(user1, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000000')); // 500m wmatic
    await UniswapUtils.buyToken(user1, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000000'));
    await UniswapUtils.buyToken(user2, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('500000000')); // 500m wmatic
    await UniswapUtils.buyToken(user2, MaticAddresses.SUSHI_ROUTER, MaticAddresses.USDC_TOKEN, utils.parseUnits('2000000'));
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
    for (let i = 0; i < max + 12; i++) {
      await openAndCheck(
          user1,
          loan,
          collateralToken,
          '10' + i,
          '555' + i,
          99 + i,
          10 + i
      );

      if (i !== 0 && i % 10 === 0) {
        await closeAndCheck(i - 2, user1, loan);
      }
    }

    await Erc20Utils.approve(collateralToken, user1, loan.address, '10');
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

    const acquiredAmount = '555';
    const id = await openAndCheck(
        user1,
        loan,
        collateralToken,
        '10',
        acquiredAmount,
        0,
        0
    );

    await bidAndCheck(id, acquiredAmount, user2, loan)
  });

  it("bid on position and claim", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const acquiredAmount = '555';
    const id = await openAndCheck(
        user1,
        loan,
        collateralToken,
        '10',
        acquiredAmount,
        1,
        0
    );

    await bidAndCheck(id, acquiredAmount, user2, loan);
    await TimeUtils.advanceNBlocks(2);
    await claimAndCheck(id, user2, loan);
  });

  it("open position and redeem", async () => {
    const collateralToken = MaticAddresses.WMATIC_TOKEN;

    const acquiredAmount = '555';
    const id = await openAndCheck(
        user1,
        loan,
        collateralToken,
        '10',
        acquiredAmount,
        1,
        0
    );
    await bidAndCheck(id, acquiredAmount, user2, loan);
    await redeemAndCheck(id, user1, loan);
  });

});

async function openAndCheck(
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
  expect(collateral.collateralType).is.eq(0);
  expect(collateral.collateralAmount.toString()).is.eq(collateralAmount);
  expect(collateral.collateralTokenId.toNumber()).is.eq(0);

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
  return id;
}

async function closeAndCheck(id: number, signer: SignerWithAddress, loan: TetuLoans): Promise<void> {
  const loanListLength = (await loan.loanListSize()).toNumber();
  const lastLoanId = (await loan.loansList(loanListLength - 1)).toNumber();
  const lastLoanListIndex = (await loan.loanIndexes(0, lastLoanId)).toNumber();
  expect(lastLoanListIndex).is.eq(loanListLength - 1);

  const l = await loan.loans(id);
  const loanListIndex = (await loan.loanIndexes(0, l.id)).toNumber();
  // const dec = await Erc20Utils.decimals(l.collateral.collateralToken);
  const bal = (await Erc20Utils.balanceOf(l.collateral.collateralToken, signer.address));

  await LoanUtils.closePosition(id, signer, loan);

  const balAfter = (await Erc20Utils.balanceOf(l.collateral.collateralToken, signer.address));
  expect(bal.add(l.collateral.collateralAmount).toString()).is.eq(balAfter.toString());

  const lastLoanListIndexAfter = (await loan.loanIndexes(0, lastLoanId)).toNumber();
  const loanListIndexAfter = (await loan.loanIndexes(0, l.id)).toString();
  expect(loanListIndexAfter).is.eq(LoanUtils.MAX_UINT);
  expect(lastLoanListIndexAfter).is.eq(loanListIndex);
}

async function bidAndCheck(id: number, amount: string, signer: SignerWithAddress, loan: TetuLoans) {
  const l = await loan.loans(id);
  const aBalanceBefore = await Erc20Utils.balanceOf(l.acquired.acquiredToken, signer.address);
  const cBalanceBefore = await Erc20Utils.balanceOf(l.collateral.collateralToken, signer.address);

  await LoanUtils.bid(id, amount, signer, loan);

  const aBalanceAfter = await Erc20Utils.balanceOf(l.acquired.acquiredToken, signer.address);
  expect(aBalanceBefore.sub(aBalanceAfter).toString()).is.eq(amount);

  const lAfter = await loan.loans(id);

  expect(lAfter.execution.lender.toLowerCase()).is.eq(signer.address.toLowerCase());
  expect(lAfter.execution.loanStartBlock).is.not.eq(0);
  expect(lAfter.execution.loanStartTs).is.not.eq(0);

  if (l.info.loanDurationBlocks.isZero()) {
    const cBalanceAfter = await Erc20Utils.balanceOf(l.collateral.collateralToken, signer.address);
    expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(l.collateral.collateralAmount);
    expect(lAfter.execution.loanEndTs).is.not.eq(0);
  } else {
    const lenderIndex = await loan.loanIndexes(4, id);
    expect(await loan.lenderPositions(signer.address, lenderIndex)).is.eq(id);
  }
}

async function claimAndCheck(id: number, signer: SignerWithAddress, loan: TetuLoans) {
  const l = await loan.loans(id);
  const cBalanceBefore = await Erc20Utils.balanceOf(l.collateral.collateralToken, signer.address);

  await LoanUtils.claim(id, signer, loan);

  const lAfter = await loan.loans(id);

  const cBalanceAfter = await Erc20Utils.balanceOf(l.collateral.collateralToken, signer.address);
  expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(l.collateral.collateralAmount);
  expect(lAfter.execution.loanEndTs).is.not.eq(0);
}

async function redeemAndCheck(id: number, signer: SignerWithAddress, loan: TetuLoans) {
  const l = await loan.loans(id);
  const aBalanceBefore = await Erc20Utils.balanceOf(l.acquired.acquiredToken, signer.address);
  const cBalanceBefore = await Erc20Utils.balanceOf(l.collateral.collateralToken, signer.address);
  const toRedeem = await loan.toRedeem(id);

  await LoanUtils.redeem(id, signer, loan);

  const lAfter = await loan.loans(id);

  const aBalanceAfter = await Erc20Utils.balanceOf(l.acquired.acquiredToken, signer.address);
  expect(aBalanceBefore.sub(aBalanceAfter).toString()).is.eq(toRedeem);

  const cBalanceAfter = await Erc20Utils.balanceOf(l.collateral.collateralToken, signer.address);
  expect(cBalanceAfter.sub(cBalanceBefore).toString()).is.eq(l.collateral.collateralAmount);

  expect(lAfter.execution.loanEndTs).is.not.eq(0);
}

