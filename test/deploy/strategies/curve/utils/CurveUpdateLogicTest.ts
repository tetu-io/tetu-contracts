import {MaticAddresses} from "../../../../../scripts/addresses/MaticAddresses";
import {expect} from "chai";
import {updateCurveStrategy} from "../../../../../scripts/deploy/strategies/curve/utils/CurveUpdateLogic";
import {FtmAddresses} from "../../../../../scripts/addresses/FtmAddresses";

/**
 * These tests should be skipped in CI, they are intended for debugging code of various curve-update scripts
 */
describe("Tests for updateCurveStrategy - Matic", function () {

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

  it("CurveATriCrypto3Strategy", async () => {
    const vaultNameWithoutPrefix = "CRV_ATC3";
    const strategyName = 'CurveATriCrypto3Strategy';
    const strategyContractPath = 'contracts/strategies/matic/curve/CurveATriCrypto3Strategy.sol:CurveATriCrypto3Strategy';
    const token: string = MaticAddresses.USD_BTC_ETH_CRV_TOKEN;

    const strategyAddress: string | undefined = await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
    expect(strategyAddress).to.not.equal(undefined);
  });

  it("CurveAaveStrategy", async () => {
    const vaultNameWithoutPrefix = "CRV_AAVE";
    const strategyName = 'CurveAaveStrategy';
    const strategyContractPath = 'contracts/strategies/matic/curve/CurveAaveStrategy.sol:CurveAaveStrategy';
    const token: string = MaticAddresses.AM3CRV_TOKEN;

    const strategyAddress: string | undefined = await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
    expect(strategyAddress).to.not.equal(undefined);
  });
});

/**
 * These tests should be skipped in CI, they are intended for debugging code of various curve-update scripts
 */
describe.skip("Tests for updateCurveStrategy - Fantom", function () {

  it("CurveRenFtmStrategy", async () => {
    const vaultNameWithoutPrefix = "CRV_REN";
    const strategyName = 'CurveRenFtmStrategy';
    const strategyContractPath = 'contracts/strategies/fantom/curve/CurveRenFtmStrategy.sol:CurveRenFtmStrategy';
    const token: string = FtmAddresses.renCRV_TOKEN;

    const strategyAddress: string | undefined = await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
    expect(strategyAddress).to.not.equal(undefined);
  });

  it("CurveATriCrypto3Strategy", async () => {
    const vaultNameWithoutPrefix = "CRV_GEIST";
    const strategyName = 'CurveGeistStrategy';
    const strategyContractPath = 'contracts/strategies/fantom/curve/CurveGeistStrategy.sol:CurveGeistStrategy';
    const token = FtmAddresses.g3CRV_TOKEN;

    const strategyAddress: string | undefined = await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
    expect(strategyAddress).to.not.equal(undefined);
  });

  it("Curve2PoolStrategy", async () => {
    const vaultNameWithoutPrefix = "CRV_2POOL";
    const strategyName = 'Curve2PoolStrategy';
    const strategyContractPath = 'contracts/strategies/fantom/curve/Curve2PoolStrategy.sol:Curve2PoolStrategy';
    const token: string = FtmAddresses._2poolCrv_TOKEN;

    const strategyAddress: string | undefined = await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
    expect(strategyAddress).to.not.equal(undefined);
  });

  it("CurveTriCryptoFtmStrategy", async () => {
    const vaultNameWithoutPrefix = "CRV_TRICRYPTO";
    const strategyName = 'CurveTriCryptoFtmStrategy';
    const strategyContractPath = 'contracts/strategies/fantom/curve/CurveTriCryptoFtmStrategy.sol:CurveTriCryptoFtmStrategy';
    const token: string = FtmAddresses.USD_BTC_ETH_CRV_TOKEN;

    const strategyAddress: string | undefined = await updateCurveStrategy(vaultNameWithoutPrefix, strategyName, strategyContractPath, token);
    expect(strategyAddress).to.not.equal(undefined);
  });
});