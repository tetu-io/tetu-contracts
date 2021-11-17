import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
// import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {TimeUtils} from "../../../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {StrategyAaveMaiBal} from "../../../../typechain/StrategyAaveMaiBal";
import {VaultUtils} from "../../../VaultUtils";
import {StrategyInfo} from "../../StrategyInfo";
import {UniswapUtils} from "../../../UniswapUtils";
import {TokenUtils} from "../../../TokenUtils";
import {utils} from "ethers";
import {PriceCalculator} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

dotEnvConfig();
// tslint:disable-next-line:no-var-requires
const argv = require('yargs/yargs')()
    .env('TETU')
    .options({
        disableStrategyTests: {
            type: "boolean",
            default: false,
        },
        onlyOneMultiAMBStrategyTest: {
            type: "number",
            default: -1,
        }
    }).argv;

const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal MultiAaveMaiBal tests', async () => {
    let snapshotBefore: string;
    let snapshot: string;
    let strategyInfo: StrategyInfo;

    if (argv.disableStrategyTests) {
        return;
    }

    const aavePipeIndex = 1;
    const maiPipeIndex  = 3;
    const balPipeIndex  = 4;

    let airDropper: any;
    const depositAmountStr = utils.parseUnits('100').toString()

    const airdropTokenToPipe = async function(pipeIndex: number, tokenAddress: string, amount: string) {
        await UniswapUtils.buyToken(airDropper, MaticAddresses.SUSHI_ROUTER, tokenAddress, utils.parseUnits(amount));
        const bal = await TokenUtils.balanceOf(tokenAddress, airDropper.address);
        const strategy = (await ethers.getContractAt('StrategyAaveMaiBal', strategyInfo.strategy.address)) as StrategyAaveMaiBal;
        const pipeAddress = await strategy.pipes(pipeIndex);
        await TokenUtils.transfer(tokenAddress, airDropper, pipeAddress, bal.toString());
    }


    before(async function () {
        snapshotBefore = await TimeUtils.snapshot();
        // const [signer, user] = await ethers.getSigners();
        const signer = await DeployerUtils.impersonate();
        const user = (await ethers.getSigners())[1];
        airDropper = (await ethers.getSigners())[2];

        const core = await DeployerUtils.getCoreAddressesWrapper(signer);
        const tools = await DeployerUtils.getToolsAddresses();
        const calculator = await DeployerUtils.connectInterface(signer, 'PriceCalculator', tools.calculator) as PriceCalculator

        // const core = await DeployerUtils.deployAllCoreContracts(signer, 60 * 60 * 24 * 28, 1);
        // const calculator = (await DeployerUtils.deployPriceCalculatorMatic(signer, core.controller.address))[0];

        /*    for (const rt of rewardTokens) {
              await core.feeRewardForwarder.setConversionPath(
                [rt, MaticAddresses.USDC_TOKEN, core.rewardToken.address],
                [MaticAddresses.getRouterByFactory(factory), MaticAddresses.QUICK_ROUTER]
              );
              await core.feeRewardForwarder.setConversionPath(
                [rt, MaticAddresses.USDC_TOKEN],
                [MaticAddresses.getRouterByFactory(factory)]
              );

              if (MaticAddresses.USDC_TOKEN === underlying.toLowerCase()) {
                await core.feeRewardForwarder.setConversionPath(
                  [rt, MaticAddresses.USDC_TOKEN],
                  [MaticAddresses.getRouterByFactory(factory)]
                );
              } else {
                await core.feeRewardForwarder.setConversionPath(
                  [rt, MaticAddresses.USDC_TOKEN, underlying],
                  [MaticAddresses.getRouterByFactory(factory), MaticAddresses.QUICK_ROUTER]
                );
              }

            }
            if (MaticAddresses.USDC_TOKEN !== underlying.toLowerCase()) {
              await core.feeRewardForwarder.setConversionPath(
                [underlying, MaticAddresses.USDC_TOKEN, core.rewardToken.address],
                [MaticAddresses.QUICK_ROUTER, MaticAddresses.QUICK_ROUTER]
              );
              await core.feeRewardForwarder.setConversionPath(
                [underlying, MaticAddresses.USDC_TOKEN],
                [MaticAddresses.QUICK_ROUTER]
              );
            }*/

        let underlying = MaticAddresses.WMATIC_TOKEN;
        await core.feeRewardForwarder.setLiquidityNumerator(50);
        await core.feeRewardForwarder.setLiquidityRouter(MaticAddresses.QUICK_ROUTER);

        const data = await StrategyTestUtils.deploy(
            signer,
            core,
            "WETH",
            async vaultAddress => DeployerUtils.deployContract(
                signer,
                "StrategyAaveMaiBal",
                core.controller.address,
                vaultAddress,
                underlying
            ) as Promise<StrategyAaveMaiBal>,
            underlying
        );

        const vault = data[0];
        const strategy = data[1];
        const lpForTargetToken = data[2];

        await VaultUtils.addRewardsXTetu(signer, vault, core, 1);

        await core.vaultController.changePpfsDecreasePermissions([vault.address], true);

        strategyInfo = new StrategyInfo(
            underlying,
            signer,
            user,
            core,
            vault,
            strategy,
            lpForTargetToken,
            calculator
        );

        await UniswapUtils.buyToken(user,MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('1000')); // 1000 wmatic
        await UniswapUtils.buyToken(user,MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('1000')); // 1000 wmatic
        const bal = await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, user.address);

        console.log("User WMATIC balance: ", bal.toString());

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

   /* it("do hard work with liq path", async () => {
        await StrategyTestUtils.doHardWorkWithLiqPath(strategyInfo,
            (await TokenUtils.balanceOf(strategyInfo.underlying, strategyInfo.user.address)).toString(),
            null
        );
    });*/

    it("do hard work with liq path AAVE WMATIC rewards", async () => {
        console.log('AAVE WMATIC rewards');
        await StrategyTestUtils.doHardWorkWithLiqPath(
            strategyInfo,
            depositAmountStr,
            null,
            async () => {
                await airdropTokenToPipe(aavePipeIndex, MaticAddresses.WMATIC_TOKEN, '5');
            }
        );
    });

    it("do hard work with liq path MAI QI rewards", async () => {
        console.log('MAI QI rewards');
        await StrategyTestUtils.doHardWorkWithLiqPath(
            strategyInfo,
            depositAmountStr,
            null,
            async () => {
                await airdropTokenToPipe(maiPipeIndex, MaticAddresses.QI_TOKEN, '5');
            }
        );
    });

    it("do hard work with liq path Balancer BAL rewards", async () => {
        console.log('Balancer BAL rewards');
        await StrategyTestUtils.doHardWorkWithLiqPath(
            strategyInfo,
            depositAmountStr,
            null,
            async () => {
                await airdropTokenToPipe(balPipeIndex, MaticAddresses.BAL_TOKEN, '5');
            }
        );
    });

});
