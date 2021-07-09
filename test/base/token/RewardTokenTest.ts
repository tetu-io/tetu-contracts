import {ethers} from "hardhat";
import chai from "chai";
import {RewardToken} from "../../../typechain";
import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../../MaticAddresses";
import {Erc20Utils} from "../../Erc20Utils";
import {UniswapUtils} from "../../UniswapUtils";
import {utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chaiAsPromised from "chai-as-promised";
import {TimeUtils} from "../../TimeUtils";
import {CoreContractsWrapper} from "../../CoreContractsWrapper";
import {MintHelperUtils} from "../../MintHelperUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("Reward token contract tests", () => {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let signerAddress: string;
  let core: CoreContractsWrapper;

  before(async () => {
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];
    signerAddress = signer.address;
    // deploy core contracts
    core = await DeployerUtils.deployAllCoreContracts(signer);
    await core.mintHelper.startMinting();
    await UniswapUtils.wrapMatic(signer);
    await UniswapUtils.buyToken(signer, MaticAddresses.QUICK_ROUTER,
        MaticAddresses.USDC_TOKEN, utils.parseUnits("10000", 18))
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


  it("Mint tokens", async () => {
    await MintHelperUtils.mint(core.mintHelper, "100");
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signerAddress))
    .at.eq(utils.parseUnits("30", 18));

    await MintHelperUtils.mint(core.mintHelper, "200");
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address))
    .at.eq(utils.parseUnits("90", 18));
  });
  it("Should not mint after change minter", async () => {
    const newMinter = await DeployerUtils.deployMintHelper(
        signer, core.controller.address, [signer.address], [3000]
    );
    await core.mintHelper.changeAdmin(newMinter.address)
    await expect(MintHelperUtils.mint(core.mintHelper, "100"))
    .to.be.rejectedWith("must have minter role to mint");
  });
  it("Should not mint without token", async () => {
    const newMinter = await DeployerUtils.deployMintHelper(
        signer, core.controller.address, [signer.address], [3000]
    );
    await core.mintHelper.changeAdmin(newMinter.address);
    await core.controller.setRewardToken(newMinter.address);
    await expect(MintHelperUtils.mint(newMinter, "100"))
    .to.be.rejectedWith();
  });
  it("Mint tokens after admin change", async () => {
    const newMinter = await DeployerUtils.deployMintHelper(
        signer, core.controller.address, [signer.address], [3000]
    );
    await core.controller.setMintHelper(newMinter.address);
    await core.mintHelper.changeAdmin(newMinter.address)
    await MintHelperUtils.mint(newMinter, "100");
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address))
    .at.eq(utils.parseUnits("30", 18));
  });
  it("Mint tokens to different destinations", async () => {
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, MaticAddresses.USDC_TOKEN))
    .at.eq(utils.parseUnits("0", 18));
    const newMinter = await DeployerUtils.deployMintHelper(
        signer, core.controller.address,
        [signer.address, core.psVault.address, MaticAddresses.USDC_TOKEN, MaticAddresses.WMATIC_TOKEN],
        [1003, 953, 547, 497]
    );
    await core.controller.setMintHelper(newMinter.address);
    await core.mintHelper.changeAdmin(newMinter.address);
    await MintHelperUtils.mint(newMinter, "100");

    expect(await Erc20Utils.balanceOf(core.rewardToken.address, core.notifyHelper.address))
    .at.eq(utils.parseUnits("70", 18));

    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address))
    .at.eq(utils.parseUnits("10.03", 18));

    expect(await Erc20Utils.balanceOf(core.rewardToken.address, MaticAddresses.USDC_TOKEN))
    .at.eq(utils.parseUnits("5.47", 18));

    expect(await Erc20Utils.balanceOf(core.rewardToken.address, MaticAddresses.WMATIC_TOKEN))
    .at.eq(utils.parseUnits("4.97", 18));
  });
  it("Wrong minter deploy", async () => {
    await expect(DeployerUtils.deployMintHelper(
        signer, core.controller.address,
        [signer.address, core.psVault.address], [2100, 10]
    )).to.be.rejectedWith("wrong sum of fraction");

    await expect(DeployerUtils.deployMintHelper(
        signer, core.controller.address,
        [signer.address, MaticAddresses.ZERO_ADDRESS], [2100, 900]
    )).to.be.rejectedWith("Address should not be 0");

    await expect(DeployerUtils.deployMintHelper(
        signer, core.controller.address,
        [signer.address], [2100, 900]
    )).to.be.rejectedWith("wrong size");

    await expect(DeployerUtils.deployMintHelper(
        signer, core.controller.address,
        [signer.address, core.psVault.address], [3000, 0]
    )).to.be.rejectedWith("Ratio should not be 0");
  });

  it("Should not mint more than max emission per week", async () => {
    await MintHelperUtils.mint(core.mintHelper, "1");
    const maxTotalAmount = await core.rewardToken.maxTotalSupplyForCurrentBlock()
    const totalAmount = await core.rewardToken.totalSupply();
    await expect(MintHelperUtils.mint(core.mintHelper,
        utils.formatUnits(maxTotalAmount.sub(totalAmount).add(1), 18)))
    .to.be.rejectedWith("limit exceeded");
  });
  it("Should mint max emission per week", async () => {
    await MintHelperUtils.mint(core.mintHelper, "100");
    const curWeek = await core.rewardToken.currentWeek();
    const maxTotalAmount = await core.rewardToken.maxTotalSupplyForCurrentBlock();
    const totalAmount = await core.rewardToken.totalSupply();
    const mintingStartTs = await core.rewardToken.mintingStartTs();
    console.log('maxTotalAmount',
        utils.formatUnits(maxTotalAmount, 18),
        utils.formatUnits(totalAmount, 18),
        curWeek.toString(),
        mintingStartTs.toString(),
    );
    const mintAmount = utils.formatUnits(maxTotalAmount.sub(totalAmount), 18);
    expect(mintAmount).at.eq("129746027.0");
    await MintHelperUtils.mint(core.mintHelper, mintAmount);
  });
  it("Should mint max emission after few weeks", async () => {
    await MintHelperUtils.mint(core.mintHelper, "100");
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7 * 2.5);
    const currentWeek = await core.rewardToken.currentWeek();
    expect(currentWeek).at.eq("3");
    const maxTotalAmount = await core.rewardToken.maxTotalSupplyForCurrentBlock();
    const totalAmount = await core.rewardToken.totalSupply();
    const mintAmount = utils.formatUnits(maxTotalAmount.sub(totalAmount), 18);
    expect(maxTotalAmount.sub(totalAmount).toString()).at.eq("259492154000000000000000000");
    await MintHelperUtils.mint(core.mintHelper, mintAmount)
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address))
    .at.eq("77847676200000000000000000");
  });
  it("Should mint all emission", async () => {
    await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7 * 52 * 4);
    const currentWeek = await core.rewardToken.currentWeek();
    expect(currentWeek).at.eq("209");
    const maxTotalAmount = await core.rewardToken.maxTotalSupplyForCurrentBlock();
    const totalAmount = await core.rewardToken.totalSupply();
    const mintAmount = utils.formatUnits(maxTotalAmount.sub(totalAmount), 18);
    expect(maxTotalAmount.sub(totalAmount).toString()).at.eq("1000000000000000000000000000");
    await MintHelperUtils.mint(core.mintHelper, mintAmount)
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address))
    .at.eq(utils.parseUnits("300000000.000000000000000000", 18));
  });
  it("log2 test", async () => {
    const signer = (await ethers.getSigners())[0];
    const rewardToken = await DeployerUtils.deployContract(
        signer, "RewardToken", MaticAddresses.USDC_TOKEN) as RewardToken;
    expect((await rewardToken._log2(utils.parseUnits("1", 18))).toString())
    .at.eq("0");

    expect((await rewardToken._log2(utils.parseUnits("2", 18))).toString())
    .at.eq(utils.parseUnits("1", 18));

    expect((await rewardToken._log2(utils.parseUnits("8", 18))).toString())
    .at.eq(utils.parseUnits("3", 18));

    expect((await rewardToken._log2(utils.parseUnits("5", 18))).toString())
    .at.eq("2321928094887362334");

    expect((await rewardToken._log2(utils.parseUnits("500", 18))).toString())
    .at.eq("8965784284662087030");

    expect((await rewardToken._log2(utils.parseUnits("123456789", 18))).toString())
    .at.eq("26879430932860473806");

    expect((await rewardToken._log2(utils.parseUnits("123456789123456789", 18))).toString())
    .at.eq("56776783788289429979");

    expect((await rewardToken._log2(utils.parseUnits("123456789123456789123456789123456789", 18))).toString())
    .at.eq("116571489496261952241");

    await expect(rewardToken._log2(2)).rejectedWith('log input should be greater 1e18');
  });
  it("should set distributor", async () => {
    await core.controller.setNotifyHelper(signer.address);
    await MintHelperUtils.mint(core.mintHelper, "100");
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, signer.address))
    .is.eq("100000000000000000000");
  });
  it("all time vesting", async () => {
    const mintPeriod = await core.rewardToken.MINTING_PERIOD();
    const w = mintPeriod.toNumber() / (60 * 60 * 24 * 7);

    const weeks: number[] = [];
    for (let i = 1; i < w; i++) {
      const maxTotalAmount = +utils.formatUnits(await core.rewardToken.maxTotalSupplyForCurrentBlock());
      await TimeUtils.advanceBlocksOnTs(60 * 60 * 24 * 7 + 10000);
      weeks.push(maxTotalAmount);
    }

    for (let i = 1; i <= weeks.length; i++) {
      console.log(i + ', ' + weeks[i - 1].toFixed());
    }

  });

  it("should not change admin", async () => {
    const extUser = (await ethers.getSigners())[1];
    await expect(core.rewardToken.connect(extUser).changeOwner(MaticAddresses.ZERO_ADDRESS)).rejectedWith('not admin');
  });

  it("external user should not start", async () => {
    const extUser = (await ethers.getSigners())[1];
    await expect(core.rewardToken.connect(extUser).startMinting()).rejectedWith('not admin');
  });

  it("should not start twice", async () => {
    const token = await DeployerUtils.deployContract(signer, 'RewardToken', signer.address) as RewardToken;
    await token.startMinting();
    await expect(token.startMinting()).rejectedWith('minting already started');
  });

  it("should not mint before start", async () => {
    const token = await DeployerUtils.deployContract(signer, 'RewardToken', signer.address) as RewardToken;
    await expect(token.mint(signer.address, '1')).rejectedWith('minting not started');
  });

  it("not started week is zero", async () => {
    const token = await DeployerUtils.deployContract(signer, 'RewardToken', signer.address) as RewardToken;
    expect(await token.currentWeek()).is.eq(0);
    expect(await token.maxTotalSupplyForCurrentBlock()).is.eq(0);
  });

  it("should not change role", async () => {
    const token = await DeployerUtils.deployContract(signer, 'RewardToken', signer.address) as RewardToken;
    const minterRole = await token.MINTER_ROLE();
    await token.grantRole(minterRole, MaticAddresses.USDC_TOKEN);
    expect(await token.hasRole(minterRole, MaticAddresses.USDC_TOKEN)).is.false;
  });

  it("Should mint after change minter", async () => {
    const newMinter = await DeployerUtils.deployMintHelper(
        signer, core.controller.address, [MaticAddresses.QUICK_ROUTER], [3000]
    );
    await core.mintHelper.changeAdmin(newMinter.address)
    await MintHelperUtils.mint(newMinter, "100");
    expect(await Erc20Utils.balanceOf(core.rewardToken.address, MaticAddresses.QUICK_ROUTER)).is.not.eq(0);
  });

});

