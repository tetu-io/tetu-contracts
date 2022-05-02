import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {updateCurveStrategy} from "../../../../scripts/deploy/strategies/curve/utils/CurveUpdateLogic";
import {expect} from "chai";

/**
 * These tests should be skipped in CI, they are intended for debugging code of various curve-update scripts
 */
describe.skip("Tests for updateSpookyStrategy - Fantom", function () {

  it("CurveRenStrategy", async () => {
    const vaultNameWithoutPrefix = "CRV_REN";
    const strategyName = 'CurveRenStrategy';
    const strategyContractPath = 'contracts/strategies/matic/curve/CurveRenStrategy.sol:CurveRenStrategy';
    const token: string = MaticAddresses.BTCCRV_TOKEN;

    const strategyAddress: string | undefined = await updateCurveStrategy(
      vaultNameWithoutPrefix
      , strategyName
      , strategyContractPath
      , token
      // , "0x98C879fe2a22297DaBE1559247525d5269D87b61" // use known vault address to accelerate tests
    );
    expect(strategyAddress).to.not.equal(undefined);
  });
}