import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
// import {readFileSync} from "fs";
import {config as dotEnvConfig} from "dotenv";
import {TimeUtils} from "../../../TimeUtils";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {StrategyTestUtils} from "../../StrategyTestUtils";
import {
    ICamWMATIC,
    IErc20Stablecoin,
    PriceSource,
    MockPriceSource,
    StrategyAaveMaiBal
} from "../../../../typechain";
import {VaultUtils} from "../../../VaultUtils";
import {StrategyInfo} from "../../StrategyInfo";
import {UniswapUtils} from "../../../UniswapUtils";
import {TokenUtils} from "../../../TokenUtils";
import {BigNumber, utils} from "ethers";
import {PriceCalculator} from "../../../../typechain";
// import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

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

// const {expect} = chai;
chai.use(chaiAsPromised);

describe('Universal MultiAaveMaiBal tests', async () => {
    let snapshotBefore: string;
    let snapshot: string;
    let strategyInfo: StrategyInfo;

    if (argv.disableStrategyTests) {
        return;
    }

    let strategyAaveMaiBal: any;

    const AAVE_PIPE_INDEX = 1;
    const MAI_PIPE_INDEX = 3;
    const BAL_PIPE_INDEX = 4;

    const TIME_SHIFT = 60 * 60 * 24 * 30 * 3;  // months;
    const MAI_STABLECOIN_ADDRESS   = '0x88d84a85A87ED12B8f098e8953B322fF789fCD1a';
    const PRICE_SOURCE_ADDRESS = '0x7791b9d71fa3A9782183B810f26b5C2eEdf53Eb0';

    const DEPOSIT_AMOUNT = utils.parseUnits('1000')
    const REWARDS_AMOUNT = utils.parseUnits('10')

    let ICamWMATIC: any;
    let airDropper: any;

    const airdropTokenToPipe = async function (pipeIndex: number, tokenAddress: string, amount: BigNumber) {
        // claim aave rewards on mai
        console.log('claimAaveRewards');
        await ICamWMATIC.claimAaveRewards();

        // air drop reward token
        await UniswapUtils.buyToken(airDropper, MaticAddresses.SUSHI_ROUTER, tokenAddress, amount);
        const bal = await TokenUtils.balanceOf(tokenAddress, airDropper.address);
        const pipeAddress = await strategyAaveMaiBal.pipes(pipeIndex);
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
        ICamWMATIC = await DeployerUtils.connectInterface(signer, 'ICamWMATIC', MaticAddresses.CAMWMATIC_TOKEN) as ICamWMATIC

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

        // noinspection DuplicatedCode
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

        await UniswapUtils.buyToken(user,
            MaticAddresses.SUSHI_ROUTER,
            MaticAddresses.WMATIC_TOKEN,
            DEPOSIT_AMOUNT
        );
        await UniswapUtils.buyToken(airDropper,
            MaticAddresses.SUSHI_ROUTER,
            MaticAddresses.WMATIC_TOKEN,
            REWARDS_AMOUNT
        );
        const bal = await TokenUtils.balanceOf(MaticAddresses.WMATIC_TOKEN, user.address);

        console.log("User WMATIC balance: ", bal.toString());

        strategyAaveMaiBal = (await ethers.getContractAt('StrategyAaveMaiBal', strategyInfo.strategy.address)) as StrategyAaveMaiBal;

        //TODO uncomment for doHardWorkWithLiqPath tests
        /*const rewardTokens = await strategyAaveMaiBal.rewardTokens();
        console.log('rewardTokens', rewardTokens);
        for (const rt of rewardTokens) {
            await StrategyTestUtils.setConversionPath(rt, core.rewardToken.address, calculator, core.feeRewardForwarder);
            await StrategyTestUtils.setConversionPath(rt, await DeployerUtils.getUSDCAddress(), calculator, core.feeRewardForwarder);
        }*/

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


    it("do hard work with liq path AAVE WMATIC rewards", async () => {
        console.log('AAVE WMATIC rewards');
        await StrategyTestUtils.doHardWorkWithLiqPath(
            strategyInfo,
            DEPOSIT_AMOUNT.toString(),
            null,
            () => airdropTokenToPipe(AAVE_PIPE_INDEX, MaticAddresses.WMATIC_TOKEN, REWARDS_AMOUNT),
            TIME_SHIFT,
        );
    });

    it("do hard work with liq path MAI QI rewards", async () => {
        console.log('MAI QI rewards');
        await StrategyTestUtils.doHardWorkWithLiqPath(
            strategyInfo,
            DEPOSIT_AMOUNT.toString(),
            null,
            () => airdropTokenToPipe(MAI_PIPE_INDEX, MaticAddresses.QI_TOKEN, REWARDS_AMOUNT),
            TIME_SHIFT,
        );
    });

    it("do hard work with liq path Balancer BAL rewards", async () => {
        console.log('Balancer BAL rewards');
        await StrategyTestUtils.doHardWorkWithLiqPath(
            strategyInfo,
            DEPOSIT_AMOUNT.toString(),
            null,
            () => airdropTokenToPipe(BAL_PIPE_INDEX, MaticAddresses.BAL_TOKEN, REWARDS_AMOUNT),
            TIME_SHIFT,
        );
    });

    it("Target percentage", async () => {
        console.log('Rebalance test');
        const strategyGov = strategyAaveMaiBal.connect(strategyInfo.signer);

        const targetPercentageInitial = await strategyGov.targetPercentage()
        console.log('>>>targetPercentageInitial', targetPercentageInitial.toString());

        await VaultUtils.deposit(strategyInfo.user, strategyInfo.vault, BigNumber.from(DEPOSIT_AMOUNT));
        console.log('>>>deposited');
        const bal1 = await strategyGov.getMostUnderlyingBalance()
        console.log('>>>bal1', bal1.toString());

        // increase collateral to debt percentage twice, so debt should be decreased twice
        await strategyGov.setTargetPercentage(targetPercentageInitial*2)
        const targetPercentage2 = await strategyGov.targetPercentage()
        console.log('>>>targetPercentage2', targetPercentage2.toString())

        const bal2 = await strategyGov.getMostUnderlyingBalance()
        console.log('>>>bal2', bal2.toString());

        // return target percentage back, so debt should be increased twice
        await strategyGov.setTargetPercentage(targetPercentageInitial)
        const targetPercentage3 = await strategyGov.targetPercentage()
        console.log('>>>targetPercentage3', targetPercentage3.toString())

        const bal3 = await strategyGov.getMostUnderlyingBalance()
        console.log('>>>bal3', bal3.toString());

        expect(bal2).to.be.closeTo(bal1.div(2), bal1.div(200)); // 0.5% deviation max
        expect(bal3).to.be.closeTo(bal1, bal1.div(200));        // 0.5% deviation max

    });

    it.only("Rebalance on matic price change", async () => {
        console.log('Rebalance test');
        const strategyGov = strategyAaveMaiBal.connect(strategyInfo.signer);

        const stablecoin  = (await ethers.getContractAt('IErc20Stablecoin', MAI_STABLECOIN_ADDRESS)) as IErc20Stablecoin;

        await VaultUtils.deposit(strategyInfo.user, strategyInfo.vault, BigNumber.from(DEPOSIT_AMOUNT));
        console.log('>>>deposited');
        const bal1 = await strategyGov.getMostUnderlyingBalance()
        console.log('>>>bal1', bal1.toString())

        // *** mock price *2 ***

        const stablecoinEthPrice = await stablecoin.getEthPriceSource()
        console.log('stablecoinEthPrice ', stablecoinEthPrice.toString())

        const priceSource = (await ethers.getContractAt('PriceSource', PRICE_SOURCE_ADDRESS)) as PriceSource;
        const [,priceSourcePrice,,] = await priceSource.latestRoundData()
        console.log('priceSourcePrice   ', priceSourcePrice.toString())

        const mockPriceSource = await DeployerUtils.deployContract(
            strategyInfo.signer, 'MockPriceSource', priceSourcePrice.mul(2));
        const [,mockSourcePrice,,] = await mockPriceSource.latestRoundData()
        console.log('mockSourcePrice    ', mockSourcePrice.toString())

        const ethPriceSourceSlotIndex = '0x10'
        const adrOriginal = await DeployerUtils.getStorageAt(stablecoin.address, ethPriceSourceSlotIndex)
        console.log('adrOriginal        ', adrOriginal)
        // set matic price source to our mock contract
        // convert address string to bytes32 string
        const adrBytes32 = '0x' + '0'.repeat(24) + mockPriceSource.address.slice(2)

        console.log('adrBytes32         ', adrBytes32)
        await DeployerUtils.setStorageAt(stablecoin.address, ethPriceSourceSlotIndex, adrBytes32);

        const stablecoinEthPrice2 = await stablecoin.getEthPriceSource()
        console.log('stablecoinEthPrice2', stablecoinEthPrice2.toString())

        expect(stablecoinEthPrice2).to.be.equal(mockSourcePrice)

        // ***** check balance after matic price changed x2 ***

        await strategyGov.rebalanceAllPipes()
        const bal2 = await strategyGov.getMostUnderlyingBalance()
        console.log('>>>bal2', bal2.toString())

        // ***** check balance after matic price changed back ***

        // set matic price source back to original value
        await DeployerUtils.setStorageAt(stablecoin.address, ethPriceSourceSlotIndex, adrOriginal);
        const stablecoinEthPrice3 = await stablecoin.getEthPriceSource();
        console.log('stablecoinEthPrice3', stablecoinEthPrice3.toString());

        await strategyGov.rebalanceAllPipes()
        const bal3 = await strategyGov.getMostUnderlyingBalance()
        console.log('>>>bal3', bal3.toString())

        expect(bal2).to.be.closeTo(bal1.mul(2), bal1.div(200)); // 0.5% deviation max
        expect(bal3).to.be.closeTo(bal1, bal1.div(200));        // 0.5% deviation max

    });

});
