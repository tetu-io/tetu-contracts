import chai, {expect} from "chai";
import chaiAsPromised from "chai-as-promised";
import {ethers, network, config} from "hardhat";
import {MaticAddresses} from "../../scripts/addresses/MaticAddresses";
import {DeployerUtils} from "../../scripts/deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {TokenUtils} from "../TokenUtils";

chai.use(chaiAsPromised);

interface ITokenData {
  address: string;
  decimals: number;
  symbol: string;
}

interface IFeeTokenData {
  address: string;
  decimals: number;
  symbol: string;
  fee: string;
}

interface IFeeTokens {
  [address: string]: IFeeTokenData;
}

describe("Biggest Holder test", function () {
  let signer: SignerWithAddress;
  let core;

  before(async function () {
    this.timeout(1200000);

    signer = (await ethers.getSigners())[0];
    core = await DeployerUtils.getCoreAddresses();
    // usdc = await DeployerUtils.getUSDCAddress();
  })

  it("get biggest holder test", async () => {
    const token =  MaticAddresses.USDT_TOKEN
    const holder = (await TokenUtils.getBiggestHolder(token))?.toLowerCase();
    console.log('holder', holder);

    expect(holder).eq(TokenUtils.TOKEN_HOLDERS.get(token) as string);
  });

})
