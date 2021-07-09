import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {MaticAddresses} from "../../../MaticAddresses";
import {startDefaultSingleTokenStrategyTest} from "../../DefaultSingleTokenStrategyTest";


const {expect} = chai;
chai.use(chaiAsPromised);

describe('StrategyWault_WEXpoly tests', async () => {

  await startDefaultSingleTokenStrategyTest(
      'StrategyWault_WEXpoly',
      MaticAddresses.WAULT_FACTORY,
      MaticAddresses.WEXpoly_TOKEN,
      [MaticAddresses.WEXpoly_TOKEN]
  );

});
