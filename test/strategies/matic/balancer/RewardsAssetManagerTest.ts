import chai from "chai";
import chaiAsPromised from "chai-as-promised";
// import { MaticAddresses } from "../../../MaticAddresses";
import { Settings } from "../../../../settings";
import { ethers} from "hardhat";
// import { Erc20Utils } from "../../../Erc20Utils";
import { StrategyInfo } from "../../StrategyInfo";
import { TimeUtils } from "../../../TimeUtils";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {IVault} from "../../../../typechain";
import {MaticAddresses} from "../../../MaticAddresses";
// import { DeployerUtils } from "../../../../scripts/deploy/DeployerUtils";
// import { StrategyTestUtils } from "../../StrategyTestUtils";
// import { DoHardWorkLoop } from "../../DoHardWorkLoop";
// import {CurveUtils} from "../curve/utils/CurveUtils";
// import {CurveDoHardWorkLoop} from "../curve/utils/CurveDoHardWorkLoop";

chai.use(chaiAsPromised);

enum PoolSpecialization {
    GeneralPool = 0,
    MinimalSwapInfoPool,
    TwoTokenPool,
}

describe('Balancer AM tests', async () => {
    if (Settings.disableStrategyTests) {
        return;
    }
    let snapshotBefore: string;
    let snapshot: string;
    let strategyInfo: StrategyInfo;
    let vault = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

    before(async function () {
        snapshotBefore = await TimeUtils.snapshot();
        const [signer, investor,] = (await ethers.getSigners());

        // Connect to balancer vault
        let vault = await ethers.getContractAt("IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8") as IVault;

        // Deploy Pool
        const pool = await DeployerUtils.deployContract(
            signer, "MockAssetManagedPool", vault.address, PoolSpecialization.GeneralPool);

        const poolId = await pool.getPoolId();

        // Deploy Asset manager
        const assetManager = await DeployerUtils.deployContract(signer,
            'MockRewardsAssetManager', vault.address, poolId, MaticAddresses.WBTC_TOKEN);

        console.log(poolId);
        console.log(await assetManager.getPoolAddress());


        //
        // await tokens.mint({ to: lp, amount: tokenInitialBalance.mul(2) });
        // await tokens.approve({ to: vault.address, from: [lp] });
        //
        // // Assign assetManager to the DAI token, and other to the other token
        // const assetManagers = [assetManager.address, other.address];
        //
        // await pool.registerTokens(tokens.addresses, assetManagers);
        //
        // await vault.instance.connect(lp).joinPool(poolId, lp.address, lp.address, {
        //     assets: tokens.addresses,
        //     maxAmountsIn: tokens.addresses.map(() => MAX_UINT256),
        //     fromInternalBalance: false,
        //     userData: encodeJoin(
        //         tokens.addresses.map(() => tokenInitialBalance),
        //         tokens.addresses.map(() => 0)
        //     ),
        // });

        console.log('############## Preparations completed ##################');
    });

    beforeEach(async function () {
        snapshot = await TimeUtils.snapshot();
    });

    afterEach(async function () {
        await TimeUtils.rollback(snapshot);
    });

    after(async function () {
        await TimeUtils.rollback(snapshotBefore);
    });

    it("basic AM test", async function (){
        console.log("Go go go");
        }
    );


    // it("doHardWork loop", async function () {
    //     await DoHardWorkLoop.doHardWorkLoop(
    //         strategyInfo,
    //         (await Erc20Utils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
    //         3,
    //         27000
    //     );
    // });
    //
    // it("emergency exit", async () => {
    //     await StrategyTestUtils.checkEmergencyExit(strategyInfo);
    // });
    //
    // it("common test should be ok", async () => {
    //     await StrategyTestUtils.commonTests(strategyInfo);
    // });

});



