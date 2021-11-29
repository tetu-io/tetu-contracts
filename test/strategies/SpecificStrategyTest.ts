import {DeployInfo} from "./DeployInfo";

export abstract class SpecificStrategyTest {

  abstract do(deployInfo: DeployInfo): Promise<void>;

}
