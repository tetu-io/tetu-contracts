import {DeployerUtils} from "../../../scripts/deploy/DeployerUtils";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {MockController, MockStrategy, MockToken, MockToken__factory, StrategySplitter} from "../../../typechain";

export class MockHelpers {
  public static async deployStrategySplitter(deployer: SignerWithAddress) : Promise<StrategySplitter> {
    return await DeployerUtils.deployContract(deployer, "StrategySplitter") as StrategySplitter;
  }

  public static async deployMockTokens(
    deployer: SignerWithAddress,
    name: string = "USDC",
    symbol: string = "usdc",
    decimals: number = 6
  ) : Promise<MockToken> {
    return await DeployerUtils.deployContract(deployer, "MockToken", name, symbol, decimals) as MockToken;
  }

  public static async deployMockStrategy(deployer: SignerWithAddress) : Promise<MockStrategy> {
    return await DeployerUtils.deployContract(deployer, "MockStrategy") as MockStrategy;
  }

  public static async deployMockController(deployer: SignerWithAddress) : Promise<MockController> {
    return await DeployerUtils.deployContract(deployer, "MockController") as MockController;
  }

}