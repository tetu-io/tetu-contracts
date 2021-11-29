import chai from "chai";
import {BigNumber, ContractTransaction, Event, utils} from "ethers";
import chaiAsPromised from "chai-as-promised";

const {expect} = chai;
chai.use(chaiAsPromised);

export class TestAsserts {

  public static async assertEvent(
    tx: ContractTransaction,
    eventName: string,
    // tslint:disable-next-line:no-any
    args: any[],
    eIdx = 0
  ) {
    const receipt = await tx.wait();

    const events = receipt.events?.filter((e) => e.event === eventName) as Event[];
    expect(events !== undefined).is.eq(true, `Event ${eventName} not found`);
    const event = events[eIdx];
    event.args?.forEach((value, i) => {
      if (i + 1 > args.length) {
        return;
      }
      if (typeof value === 'string') {
        expect(typeof args[i]).is.eq('string', `Arg ${i} is not string`);
        expect(value.toLowerCase()).is.eq(args[i].toLowerCase(), `Arg ${i} is not equal`);
      } else if (value instanceof BigNumber) {
        expect(value.toString()).is.eq(BigNumber.from(args[i]).toString(), `Arg ${i} is not equal`);
      } else {
        expect(value).is.eq(args[i], `Arg ${i} is not equal`);
      }
    });
  }

  public static closeTo(actual: BigNumber, expected: BigNumber, deltaFactor: number, dec = 18) {
    const actualN = +utils.formatUnits(actual);
    const expectedN = +utils.formatUnits(expected);
    expect(actualN).to.be.closeTo(expectedN, expectedN * deltaFactor);
  }

}
