import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {ethers} from "hardhat";
import {TimeUtils} from "../TimeUtils";
import {ContractUtils, IERC20__factory, LiquidityMigrator} from "../../typechain";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {TokenUtils} from "../TokenUtils";
import {utils} from "ethers";
import {CoreContractsWrapper} from "../CoreContractsWrapper";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {formatUnits, parseUnits} from "ethers/lib/utils";

const {expect} = chai;
chai.use(chaiAsPromised);

describe("LiquidityMigratorTest", function () {
  let snapshot: string;
  let snapshotForEach: string;
  let signer: SignerWithAddress;
  let core: CoreContractsWrapper;
  const rewarder = '0x5Cc44D1787aFB510F563Fe55Fd082D3d4d720671'

  let migrator: LiquidityMigrator;

  before(async function () {
    this.timeout(1200000);
    snapshot = await TimeUtils.snapshot();
    signer = (await ethers.getSigners())[0];

    core = await DeployerUtils.getCoreAddressesWrapper(signer);

    migrator = await DeployerUtils.deployContract(signer, 'LiquidityMigrator') as LiquidityMigrator;
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


  it("migrate", async () => {
    const uni2Pool = await migrator.UNI2_POOL();

    const univ2Bal = await IERC20__factory.connect(uni2Pool, signer).balanceOf(core.fundKeeper.address)
    await IERC20__factory.connect(uni2Pool, await DeployerUtils.impersonate(core.fundKeeper.address)).transfer(migrator.address, univ2Bal);

    await IERC20__factory.connect(MaticAddresses.TETU_TOKEN, await DeployerUtils.impersonate(rewarder)).transfer(migrator.address, parseUnits('17000000'));

    await migrator.migrate(1);
    await migrator.migrate(100);
  });
});
