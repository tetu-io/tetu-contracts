import {DeployerUtils} from "../deploy/DeployerUtils";
import {StrategySpookySwapLp} from "../../typechain";
import {ethers} from "hardhat";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const adrs = [
    "0xFE700D523094Cc6C673d78F1446AE0743C89586E",
    "0x6d85966b5280Bfbb479E0EBA00Ac5ceDfe8760D3",
    "0x3bDbd2Ed1A214Ca4ba4421ddD7236ccA3EF088b6",
    "0xF9E426dF37D75875b136d9D25CB9f27Ee9E43C4f",
    "0xbF1e638871c59859DB851674c7F94EFcb0f40954",
    "0xda08F7DE9923acEe24CE292Ec2b20D45b1522Cb6",
    "0xd10651530f1d900F6eD65543A720f0c59C599618",
    "0x7E59478Abb9DF4682D4c4De6140104EeD83243ad",
    "0xe637F8BaA78a209919ddfE30AECd035EB4d815BB",
    "0x3Df16d5225f0B4482820a24bA692108987715ceA",
    "0x9D88DeB923c3fC633B364439c46CeA56D237D61E",
    "0x476E7652a081F749856cAeC1E2aBF563b52AEEEa",
    "0x3c072E865cFb75f94aE538a120f85B204b3f07aD",
    "0x135F9bDb89aA6a3ad14F9aCd3346Ae2376D0364F",
    "0x06aFdc7b90eE8570a0C6600Ecb1b80cCfdD80dF5",
    "0x67689281BD2aA5F7611C80E4Ad6174d39e600208",
    "0xBe157f5baC341c47342e2B1BDe83cA71c23c4bd6",
    "0x8626a577EA3139d14EF905B8EBE3cEbB395Ff358",
    "0x44f9F15ECEad55FCdE276ee0369df7E301c3374b",
    "0xbCAA751ABac9f200E89BA001F4A75e023730Ea2d",
    "0x85EC55D9112A2635BE472B6A77DF720d3879683D",
    "0x90351d15F036289BE9b1fd4Cb0e2EeC63a9fF9b0",
    "0x96cee247B587c19D5570dae254d57958e92D75f0",
    "0xa4320b575e86cFa06379B8eD8C76d9149A30F948",
    "0x3D04b20CD71aa7b371C3f27fc4320fCBe248c3a6",
    "0xe926a29f531AC36A0D635a5494Fd8474b9a663aD",
    "0x0C27719A3EdC8F3F1E530213c33548456f379892",
    "0xE37AEe4BcE46CA3e397C189ee3C64FcB74b35508",
    "0x8A571137DA0d66c2528DA3A83F097fbA10D28540",
    "0x9D2375e1A429AcFdc9cc8936ea851FF4332315cA",
    "0x1df8188d8D341ffa7e4da3CC9f2F024260457179",
    "0x33DbC25D37479d9c1363eca8C3bBc7366F1E3336",
  ]

  for (const adr of adrs) {
    const str = await DeployerUtils.connectInterface(signer, 'StrategySpookySwapLp', adr) as StrategySpookySwapLp;
    await DeployerUtils.verifyWithContractName(adr, 'contracts/strategies/fantom/spooky/StrategySpookySwapLp.sol:StrategySpookySwapLp', [
      core.controller,
      await str.vault(),
      await str.underlying(),
      (await str.assets())[0],
      (await str.assets())[1],
      await str.poolID()
    ]);
  }


}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
