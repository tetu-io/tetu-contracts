import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultLpStrategyTest} from "../../DefaultLpStrategyTest";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('StrategyWault_WMATIC_WETH tests', async () => {

  await startDefaultLpStrategyTest(
      'StrategyWault_WMATIC_WETH',
      MaticAddresses.WAULT_FACTORY,
      MaticAddresses.WAULT_WMATIC_WETH,
      MaticAddresses.WMATIC_TOKEN,
      MaticAddresses.WETH_TOKEN,
      [MaticAddresses.WEXpoly_TOKEN]
  );

});
