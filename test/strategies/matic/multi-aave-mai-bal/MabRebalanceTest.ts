import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {BigNumber} from "ethers";
import {TokenUtils} from "../../../TokenUtils";
import {
  IErc20Stablecoin,
  IStrategy,
  PriceSource,
  SmartVault,
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
import {AMBUtils} from "./AMBUtils";

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
      const strategy = deployInfo?.strategy as IStrategy;
      await AMBUtils.refuelMAI(user, strategy.address);

      const {stablecoinAddress, priceSlotIndex,} = AMBUtils.getSlotsInfo(underlying);
      const bal = await TokenUtils.balanceOf(underlying, user.address);
      const strategyAaveMaiBal = deployInfo.strategy as StrategyAaveMaiBal;

      console.log('>>>Rebalance test');
      const strategyGov = strategyAaveMaiBal.connect(signer);

      const stablecoin = (await ethers.getContractAt('IErc20Stablecoin', stablecoinAddress)) as IErc20Stablecoin;

      await strategyGov.rebalanceAllPipes() // should do nothing - as we have no deposit and collateral yet. Needed for coverage call
      const needed0 = await strategyAaveMaiBal.isRebalanceNeeded();
      console.log('>>>needed0', needed0);
      const collateralPercentage0 = await strategyAaveMaiBal.collateralPercentage();
      console.log('>>>collateralPercentage0', collateralPercentage0.toString());
      const liquidationPrice0 = await strategyAaveMaiBal.liquidationPrice();
      console.log('>>>liquidationPrice0', liquidationPrice0.toString());


      await VaultUtils.deposit(user, vault, BigNumber.from(bal));
      console.log('>>>deposited');
      const bal0 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal0', bal0.toString())

      await strategyGov.rebalanceAllPipes() // should do nothing - pipe must rebalance at deposit
      const bal1 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal1', bal1.toString())

      // *** mock price +20% ***

      const stablecoinEthPrice = await stablecoin.getEthPriceSource()
      console.log('>>>stablecoinEthPrice ', stablecoinEthPrice.toString())

      const priceSourceAddress = await stablecoin.ethPriceSource()
      const priceSource = (await ethers.getContractAt('PriceSource', priceSourceAddress)) as PriceSource;
      const [, priceSourcePrice, ,] = await priceSource.latestRoundData()
      console.log('>>>priceSourcePrice   ', priceSourcePrice.toString())

      const mockPriceSource = await DeployerUtils.deployContract(
        signer, 'MockPriceSource', 0);
      const mockPricePercents = 150;
      const mockPrice = priceSourcePrice.mul(mockPricePercents).div(100)
      await mockPriceSource.setPrice(mockPrice);
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
      const collateralPercentage1 = await strategyAaveMaiBal.collateralPercentage();
      console.log('>>>collateralPercentage1', collateralPercentage1.toString());
      const liquidationPrice1 = await strategyAaveMaiBal.liquidationPrice();
      console.log('>>>liquidationPrice1', liquidationPrice1.toString());

      expect(stablecoinEthPrice2).to.be.equal(mockSourcePrice)

      // ***** check balance after matic price changed x2 ***

      await strategyGov.rebalanceAllPipes()
      const bal2 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal2', bal2.toString())
      const needed2 = await strategyAaveMaiBal.isRebalanceNeeded();
      const collateralPercentage2 = await strategyAaveMaiBal.collateralPercentage();
      console.log('>>>collateralPercentage2', collateralPercentage2.toString());
      const liquidationPrice2 = await strategyAaveMaiBal.liquidationPrice();
      console.log('>>>liquidationPrice2', liquidationPrice2.toString());

      // ***** check balance after matic price changed back ***

      // set matic price source back to original value
      await DeployerUtils.setStorageAt(stablecoin.address, ethPriceSourceSlotIndex, adrOriginal);
      const stablecoinEthPrice3 = await stablecoin.getEthPriceSource();
      console.log('>>>stablecoinEthPrice3', stablecoinEthPrice3.toString());
      const needed3 = await strategyAaveMaiBal.isRebalanceNeeded();
      console.log('>>>needed3', needed3);
      const collateralPercentage3 = await strategyAaveMaiBal.collateralPercentage();
      console.log('>>>collateralPercentage3', collateralPercentage3.toString());
      const liquidationPrice3 = await strategyAaveMaiBal.liquidationPrice();
      console.log('>>>liquidationPrice3', liquidationPrice3.toString());

      await strategyGov.rebalanceAllPipes()
      console.log('>>>rebalanced');
      const bal3 = await strategyGov.getMostUnderlyingBalance()
      console.log('>>>bal3', bal3.toString())
      const collateralPercentage4 = await strategyAaveMaiBal.collateralPercentage();
      console.log('>>>collateralPercentage4', collateralPercentage4.toString());
      const liquidationPrice4 = await strategyAaveMaiBal.liquidationPrice();
      console.log('>>>liquidationPrice4', liquidationPrice4.toString());

      expect(bal0).to.be.eq(bal1);
      const dec = await TokenUtils.decimals(underlying);
      TestAsserts.closeTo(bal2, bal1.mul(mockPricePercents).div(100), 0.005, dec);
      TestAsserts.closeTo(bal3, bal1, 0.005, dec);

      expect(needed0).is.eq(false);
      expect(needed1).is.eq(true);
      expect(needed2).is.eq(false);
      expect(needed3).is.eq(true);

      const targetPercentage = (await strategyAaveMaiBal.targetPercentage());

      expect(collateralPercentage0).is.eq(0);
      TestAsserts.closeTo(collateralPercentage1, targetPercentage.mul(mockPricePercents).div(100), 1, 0);
      TestAsserts.closeTo(collateralPercentage2, targetPercentage, 1, 0);
      TestAsserts.closeTo(collateralPercentage3, targetPercentage.mul(100).div(mockPricePercents), 1, 0);
      TestAsserts.closeTo(collateralPercentage4, targetPercentage, 1, 0);

    });
  }

}
