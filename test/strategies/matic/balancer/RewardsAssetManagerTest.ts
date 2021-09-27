import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import { Settings } from "../../../../settings";
import { ethers} from "hardhat";
import { TimeUtils } from "../../../TimeUtils";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {IERC20, IVault, MockAssetManagedPool, MockRewardsAssetManager} from "../../../../typechain";
import {MaticAddresses} from "../../../MaticAddresses";
import {UniswapUtils} from "../../../UniswapUtils";
import {BigNumber, utils} from "ethers";
import {encodeJoin} from "./helpers/mockPool";
import {MAX_UINT256} from "./helpers/constants";
import {bn, fp, FP_SCALING_FACTOR} from "./helpers/numbers";
import {Erc20Utils} from "../../../Erc20Utils";
import {BytesLike} from "@ethersproject/bytes";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {calcRebalanceAmount, encodeInvestmentConfig} from "./helpers/rebalance";
import * as expectEvent from "./helpers/expectEvent";

chai.use(chaiAsPromised);

enum PoolSpecialization {
    GeneralPool = 0,
    MinimalSwapInfoPool,
    TwoTokenPool,
}
const tokenInitialBalance = bn(200e18);

describe('Balancer AM tests', async () => {
    if (Settings.disableStrategyTests) {
        return;
    }
    let snapshotBefore: string;
    let snapshot: string;

    let vault: IVault;
    let poolId: BytesLike;
    let assetManager: MockRewardsAssetManager;
    let otherUser: SignerWithAddress;
    let pool: MockAssetManagedPool;


    before(async function () {
        snapshotBefore = await TimeUtils.snapshot();
        const [signer, investor, other] = (await ethers.getSigners());
        otherUser = other;

        // Connect to balancer vault
        vault = await ethers.getContractAt(
            "IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8") as IVault;

        // Deploy Pool
        pool = await DeployerUtils.deployContract(
            signer, "MockAssetManagedPool", vault.address, PoolSpecialization.GeneralPool) as MockAssetManagedPool;

        poolId = await pool.getPoolId();

        // Deploy Asset manager
        assetManager = await DeployerUtils.deployContract(signer,
            'MockRewardsAssetManager', vault.address, poolId, MaticAddresses.WBTC_TOKEN) as MockRewardsAssetManager;

        // Assign assetManager to the WBTC token, and other to the other token
        const assetManagers = [assetManager.address, other.address];

        await pool.registerTokens([MaticAddresses.WBTC_TOKEN, MaticAddresses.WMATIC_TOKEN], assetManagers);

        // swap tokens to invest
        await UniswapUtils.buyToken(investor, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000000000')); // 100m wmatic
        await UniswapUtils.buyToken(investor, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('1000'));
        const wbtcToken = await ethers.getContractAt("IERC20", MaticAddresses.WBTC_TOKEN, investor) as IERC20;
        await wbtcToken.approve(vault.address, tokenInitialBalance, {from: investor.address});
        let wbtcBal = await wbtcToken.balanceOf(investor.address);
        const wbtcDec = await Erc20Utils.decimals(wbtcToken.address);
        const oppositeTokenBal = +utils.formatUnits(wbtcBal, wbtcDec);
        console.log("wbtc bal :", oppositeTokenBal);


        const wmaticToken = await ethers.getContractAt("IERC20", MaticAddresses.WMATIC_TOKEN, investor) as IERC20;
        await wmaticToken.approve(vault.address, tokenInitialBalance, {from: investor.address});
        let wmaticBal = await wmaticToken.balanceOf(investor.address);
        const wmaticDec = await Erc20Utils.decimals(wmaticToken.address);
        const oppositeTokenBal2 = +utils.formatUnits(wmaticBal, wmaticDec);
        console.log("wmatic bal :", oppositeTokenBal2);

        let tokensAddresses = [MaticAddresses.WBTC_TOKEN, MaticAddresses.WMATIC_TOKEN]

        vault = await ethers.getContractAt(
            "IVault", "0xBA12222222228d8Ba445958a75a0704d566BF2C8", investor) as IVault;


        let ud = encodeJoin(
            tokensAddresses.map(() => wbtcBal),
            tokensAddresses.map(() => 0)
        );

        await vault.joinPool(poolId, investor.address, investor.address, {
            assets: tokensAddresses,
            maxAmountsIn: tokensAddresses.map(() => MAX_UINT256),
            fromInternalBalance: false,
            userData: ud,
        });

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

    describe('deployment', () => {
        it('different managers can be set for different tokens', async () => {
            expect((await vault.getPoolTokenInfo(poolId, MaticAddresses.WBTC_TOKEN)).assetManager).to.equal(assetManager.address);
            expect((await vault.getPoolTokenInfo(poolId, MaticAddresses.WMATIC_TOKEN)).assetManager).to.equal(otherUser.address);
        });
    });

    describe('setConfig', () => {
        it('allows a pool controller to set the pools target investment config', async () => {
            const updatedConfig = {
                targetPercentage: 3,
                upperCriticalPercentage: 4,
                lowerCriticalPercentage: 2,
            };
            await pool.setAssetManagerPoolConfig(assetManager.address, encodeInvestmentConfig(updatedConfig));

            const result = await assetManager.getInvestmentConfig(poolId);
            expect(result.targetPercentage).to.equal(updatedConfig.targetPercentage);
            expect(result.upperCriticalPercentage).to.equal(updatedConfig.upperCriticalPercentage);
            expect(result.lowerCriticalPercentage).to.equal(updatedConfig.lowerCriticalPercentage);
        });

        it('emits an event', async () => {
            const updatedConfig = {
                targetPercentage: 3,
                upperCriticalPercentage: 4,
                lowerCriticalPercentage: 2,
            };

            const receipt = await (
                await pool.setAssetManagerPoolConfig(assetManager.address, encodeInvestmentConfig(updatedConfig))
            ).wait();

            expectEvent.inIndirectReceipt(receipt, assetManager.interface, 'InvestmentConfigSet', {
                targetPercentage: updatedConfig.targetPercentage,
                lowerCriticalPercentage: updatedConfig.lowerCriticalPercentage,
                upperCriticalPercentage: updatedConfig.upperCriticalPercentage,
            });
        });

        it('reverts when setting upper critical over 100%', async () => {
            const badConfig = {
                targetPercentage: 0,
                upperCriticalPercentage: fp(1).add(1),
                lowerCriticalPercentage: 0,
            };
            await expect(
                pool.setAssetManagerPoolConfig(assetManager.address, encodeInvestmentConfig(badConfig))
            ).to.be.revertedWith('Upper critical level must be less than or equal to 100%');
        });

        it('reverts when setting upper critical below target', async () => {
            const badConfig = {
                targetPercentage: 1,
                upperCriticalPercentage: 0,
                lowerCriticalPercentage: 0,
            };
            await expect(
                pool.setAssetManagerPoolConfig(assetManager.address, encodeInvestmentConfig(badConfig))
            ).to.be.revertedWith('Target must be less than or equal to upper critical level');
        });

        it('reverts when setting lower critical above target', async () => {
            const badConfig = {
                targetPercentage: 1,
                upperCriticalPercentage: 2,
                lowerCriticalPercentage: 2,
            };
            await expect(
                pool.setAssetManagerPoolConfig(assetManager.address, encodeInvestmentConfig(badConfig))
            ).to.be.revertedWith('Lower critical level must be less than or equal to target');
        });

        it('prevents an unauthorized user from setting the pool config', async () => {
            const updatedConfig = {
                targetPercentage: 3,
                upperCriticalPercentage: 4,
                lowerCriticalPercentage: 2,
            };

            await expect(
                assetManager.connect(otherUser).setConfig(poolId, encodeInvestmentConfig(updatedConfig))
            ).to.be.revertedWith('Only callable by pool');
        });
    });

    describe('rebalance', () => {
        function itShouldRebalance(shouldRebalance: boolean) {
            it(`shouldRebalance returns ${shouldRebalance}`, async () => {
                const { poolCash, poolManaged } = await assetManager.getPoolBalances(poolId);
                expect(await assetManager.shouldRebalance(poolCash, poolManaged)).to.be.eq(shouldRebalance);
            });
        }

        function itRebalancesCorrectly(force: boolean) {
            it('emits a Rebalance event', async () => {
                const tx = await assetManager.rebalance(poolId, force);
                const receipt = await tx.wait();
                expectEvent.inReceipt(receipt, 'Rebalance');
            });

            it('transfers the expected number of tokens to the Vault', async () => {
                const config = await assetManager.getInvestmentConfig(poolId);
                const { poolCash, poolManaged } = await assetManager.getPoolBalances(poolId);
                const expectedRebalanceAmount = calcRebalanceAmount(poolCash, poolManaged, config);

                console.log("expected to transfer", expectedRebalanceAmount);

                const wbtcToken = await ethers.getContractAt("IERC20", MaticAddresses.WBTC_TOKEN) as IERC20;
                let wbtcBalAMB = await wbtcToken.balanceOf(assetManager.address);
                let wbtcBalVaultB = await wbtcToken.balanceOf(vault.address);

                await assetManager.rebalance(poolId, force);
                let wbtcBalAMA = await wbtcToken.balanceOf(assetManager.address);
                let wbtcBalVaultA = await wbtcToken.balanceOf(vault.address);

                expect(wbtcBalAMB.add(expectedRebalanceAmount)).to.be.eq(wbtcBalAMA);
                expect(wbtcBalVaultB.add(expectedRebalanceAmount.mul(-1))).to.be.eq(wbtcBalVaultA);

            });

            it('returns the pool to its target allocation', async () => {
                await assetManager.rebalance(poolId, force);
                const differenceFromTarget = await assetManager.maxInvestableBalance(poolId);
                expect(differenceFromTarget.abs()).to.be.lte(1);
            });

            it("updates the pool's managed balance on the vault correctly", async () => {
                await assetManager.rebalance(poolId, force);
                const { poolManaged: expectedManaged } = await assetManager.getPoolBalances(poolId);
                const { managed: actualManaged } = await vault.getPoolTokenInfo(poolId, MaticAddresses.WBTC_TOKEN);
                expect(actualManaged).to.be.eq(expectedManaged);
            });
        }

        function itSkipsTheRebalance() {
            it('skips the rebalance', async () => {
                const tx = await assetManager.rebalance(poolId, false);
                const receipt = await tx.wait();
                expectEvent.notEmitted(receipt, 'Rebalance');
            });
        }

        const config = {
            targetPercentage: fp(0.45),
            upperCriticalPercentage: fp(0.6),
            lowerCriticalPercentage: fp(0.4),
        };

        // Balances that make the Asset Manager be at the critical percentages
        let lowerCriticalBalance: BigNumber;
        let upperCriticalBalance: BigNumber;

        beforeEach(async () => {
            await pool.setAssetManagerPoolConfig(assetManager.address, encodeInvestmentConfig(config));

            const { poolCash } = await assetManager.getPoolBalances(poolId);

            lowerCriticalBalance = poolCash
                .mul(config.lowerCriticalPercentage)
                .div(FP_SCALING_FACTOR.sub(config.lowerCriticalPercentage));

            upperCriticalBalance = poolCash
                .mul(config.upperCriticalPercentage)
                .div(FP_SCALING_FACTOR.sub(config.upperCriticalPercentage));
        });

        context('when pool is above target investment level', () => {
            context('when pool is in non-critical range', () => {
                beforeEach(async () => {
                    let exUpperCriticalBalance = upperCriticalBalance.mul(99).div(100)
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000000000')); // 100m wmatic
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    const wbtcToken = await ethers.getContractAt("IERC20", MaticAddresses.WBTC_TOKEN, otherUser) as IERC20;
                    let wbtcBal = await wbtcToken.balanceOf(otherUser.address);
                    await wbtcToken.transfer(assetManager.address, exUpperCriticalBalance);
                    let wbtcBalAM = await wbtcToken.balanceOf(assetManager.address);
                    console.log("AM balance >>", wbtcBalAM.toString())
                });

                itShouldRebalance(false);

                context('when forced', () => {
                    const force = true;
                    itRebalancesCorrectly(force);
                });

                context('when not forced', () => {
                    itSkipsTheRebalance();
                });
            });

            context('when pool is above upper critical investment level', () => {
                beforeEach(async () => {
                    let exUpperCriticalBalance = upperCriticalBalance.mul(101).div(100);

                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000000000')); // 100m wmatic
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));

                    const wbtcToken = await ethers.getContractAt("IERC20", MaticAddresses.WBTC_TOKEN, otherUser) as IERC20;
                    let wbtcBal = await wbtcToken.balanceOf(otherUser.address);
                    await wbtcToken.transfer(assetManager.address, exUpperCriticalBalance);
                    let wbtcBalAM = await wbtcToken.balanceOf(assetManager.address);
                    console.log("Upper Critical bal value", exUpperCriticalBalance.toString());
                    console.log("AM balance >>", wbtcBalAM.toString());
                });

                itShouldRebalance(true);

                context('when forced', () => {
                    const force = true;
                    itRebalancesCorrectly(force);
                });

                context('when not forced', () => {
                    const force = false;
                    itRebalancesCorrectly(force);
                });
            });
        });

        context('when pool is below target investment level', () => {
            context('when pool is in non-critical range', () => {
                beforeEach(async () => {
                    let exUpperCriticalBalance = lowerCriticalBalance.mul(101).div(100);

                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000000000')); // 100m wmatic
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));

                    const wbtcToken = await ethers.getContractAt("IERC20", MaticAddresses.WBTC_TOKEN, otherUser) as IERC20;
                    let wbtcBal = await wbtcToken.balanceOf(otherUser.address);
                    await wbtcToken.transfer(assetManager.address, exUpperCriticalBalance);
                    let wbtcBalAM = await wbtcToken.balanceOf(assetManager.address);
                    console.log("Upper Critical bal value", exUpperCriticalBalance.toString());
                    console.log("AM balance >>", wbtcBalAM.toString());
                });

                itShouldRebalance(false);

                context('when forced', () => {
                    const force = true;
                    itRebalancesCorrectly(force);
                });

                context('when not forced', () => {
                    itSkipsTheRebalance();
                });
            });

            context('when pool is below lower critical investment level', () => {
                beforeEach(async () => {
                    let exUpperCriticalBalance = lowerCriticalBalance.mul(99).div(100);
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WMATIC_TOKEN, utils.parseUnits('10000000000')); // 100m wmatic
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));
                    await UniswapUtils.buyToken(otherUser, MaticAddresses.SUSHI_ROUTER, MaticAddresses.WBTC_TOKEN, utils.parseUnits('100000'));

                    const wbtcToken = await ethers.getContractAt("IERC20", MaticAddresses.WBTC_TOKEN, otherUser) as IERC20;
                    let wbtcBal = await wbtcToken.balanceOf(otherUser.address);
                    await wbtcToken.transfer(assetManager.address, exUpperCriticalBalance);
                    let wbtcBalAM = await wbtcToken.balanceOf(assetManager.address);
                    console.log("Upper Critical bal value", exUpperCriticalBalance.toString());
                    console.log("AM balance >>", wbtcBalAM.toString());
                });

                itShouldRebalance(true);

                context('when forced', () => {
                    const force = true;
                    itRebalancesCorrectly(force);
                });

                context('when not forced', () => {
                    const force = false;
                    itRebalancesCorrectly(force);
                });
            });
        });
    });
});



