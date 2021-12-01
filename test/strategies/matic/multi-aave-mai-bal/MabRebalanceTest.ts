import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {BigNumber} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {
  Bookkeeper,
  IERC20,
  IErc20Stablecoin,
  PriceSource,
  SmartVault,
  StrategyAaveFold,
  StrategyAaveMaiBal
} from "../../../../typechain";
import {VaultUtils} from "../../../VaultUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {TestAsserts} from "../../../TestAsserts";
import {ethers} from "hardhat";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {MABUtils} from "./MABUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class MabRebalanceTest extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {
    it("Rebalance on matic price change", async () => {
      const underlying = deployInfo?.underlying as string;
      const signer = deployInfo?.signer as SignerWithAddress;
      const user = deployInfo?.user as SignerWithAddress;
      const vault = deployInfo?.vault as SmartVault;

      const {stablecoinAddress, priceSlotIndex,} = MABUtils.getSlotsInfo(underlying);
      const bal = await TokenUtils.balanceOf(underlying, user.address);
      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;

      console.log('>>>Rebalance test');
      const strategyGov = strategyAaveMaiBal.connect(signer);

      const stablecoin = (await ethers.getContractAt('IErc20Stablecoin', stablecoinAddress)) as IErc20Stablecoin;

      await strategyGov.rebalanceAllPipes() // should do nothing - as we have no deposit and collateral yet. Needed for coverage call
      const needed0 = await strategyAaveMaiBal.isRebalanceNeeded();
      console.log('>>>needed0', needed0);

      await VaultUtils.deposit(user, vault, BigNumber.from(bal));
      console.log('>>>deposited');
      const bal0 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal0', bal0.toString())

      await strategyGov.rebalanceAllPipes() // should do nothing - pipe must rebalance at deposit
      const bal1 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal1', bal1.toString())

      // *** mock price *2 ***

      const stablecoinEthPrice = await stablecoin.getEthPriceSource()
      console.log('>>>stablecoinEthPrice ', stablecoinEthPrice.toString())

      const priceSourceAddress = await stablecoin.ethPriceSource()
      const priceSource = (await ethers.getContractAt('PriceSource', priceSourceAddress)) as PriceSource;
      const [, priceSourcePrice, ,] = await priceSource.latestRoundData()
      console.log('>>>priceSourcePrice   ', priceSourcePrice.toString())

      const mockPriceSource = await DeployerUtils.deployContract(
        signer, 'MockPriceSource', 0);
      await mockPriceSource.setPrice(priceSourcePrice.mul(2));
      const [, mockSourcePrice, ,] = await mockPriceSource.latestRoundData();
      console.log('>>>mockSourcePrice    ', mockSourcePrice.toString())

      const ethPriceSourceSlotIndex = priceSlotIndex;
      const adrOriginal = await DeployerUtils.getStorageAt(stablecoin.address, ethPriceSourceSlotIndex)
      console.log('>>>adrOriginal        ', adrOriginal)
      // set matic price source to our mock contract
      // convert address string to bytes32 string
      const adrBytes32 = '0x' + '0'.repeat(24) + mockPriceSource.address.slice(2)

      console.log('>>>adrBytes32         ', adrBytes32)
      await DeployerUtils.setStorageAt(stablecoin.address, ethPriceSourceSlotIndex, adrBytes32);

      const stablecoinEthPrice2 = await stablecoin.getEthPriceSource()
      console.log('>>>stablecoinEthPrice2', stablecoinEthPrice2.toString())
      const needed1 = await strategyAaveMaiBal.isRebalanceNeeded();
      console.log('>>>needed1', needed1);

      expect(stablecoinEthPrice2).to.be.equal(mockSourcePrice)

      // ***** check balance after matic price changed x2 ***

      await strategyGov.rebalanceAllPipes()
      const bal2 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal2', bal2.toString())
      const needed2 = await strategyAaveMaiBal.isRebalanceNeeded();

      // ***** check balance after matic price changed back ***

      // set matic price source back to original value
      await DeployerUtils.setStorageAt(stablecoin.address, ethPriceSourceSlotIndex, adrOriginal);
      const stablecoinEthPrice3 = await stablecoin.getEthPriceSource();
      console.log('>>>stablecoinEthPrice3', stablecoinEthPrice3.toString());
      const needed3 = await strategyAaveMaiBal.isRebalanceNeeded();
      console.log('>>>needed3', needed3);

      await strategyGov.rebalanceAllPipes()
      const bal3 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal3', bal3.toString())

      expect(bal0).to.be.eq(bal1);
      const dec = await TokenUtils.decimals(underlying);
      TestAsserts.closeTo(bal2, bal1.mul(2), 0.005, dec);
      TestAsserts.closeTo(bal3, bal1, 0.005, dec);

      expect(needed0).is.eq(false);
      expect(needed1).is.eq(true);
      expect(needed2).is.eq(false);
      expect(needed3).is.eq(true);
    });
  }

}