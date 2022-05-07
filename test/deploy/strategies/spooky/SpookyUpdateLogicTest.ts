import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {updateCurveStrategy} from "../../../../scripts/deploy/strategies/curve/utils/CurveUpdateLogic";
import {expect} from "chai";
import {updateSpookyStrategy} from "../../../../scripts/deploy/strategies/spooky/utils/SpookyUpdateLogic";
import {IStrategy} from "../../../../typechain";

/**
 * These tests should be skipped in CI, they are intended for debugging code of various curve-update scripts
 */
describe("Tests for updateSpookyStrategy - Fantom", function () {

  it("StrategySpookySwapLp", async () => {
    const spookyPoolsCsv = 'scripts/utils/download/data/spooky_pools.csv';
    const strategyName = 'StrategySpookySwapLp';
    const strategyContractPath = 'contracts/strategies/fantom/spooky/StrategySpookySwapLp.sol:StrategySpookySwapLp';

    const strategies: IStrategy[] = await updateSpookyStrategy(
      spookyPoolsCsv
      , strategyName
      , strategyContractPath
    );
    const ret = spookyPoolsCsv.length;

    expect(ret).to.greaterThan(0);
  });
});