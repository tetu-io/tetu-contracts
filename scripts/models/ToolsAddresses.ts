export class ToolsAddresses {
  public readonly calculator: string;
  public readonly reader: string;
  public readonly utils: string;
  public readonly rebalancer: string;


  constructor(calculator: string, reader: string, utils: string, rebalancer: string) {
    this.calculator = calculator;
    this.reader = reader;
    this.utils = utils;
    this.rebalancer = rebalancer;
  }
}
