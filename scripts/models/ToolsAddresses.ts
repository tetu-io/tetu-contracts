export class ToolsAddresses {
  public readonly calculator: string;
  public readonly reader: string;
  public readonly utils: string;
  public readonly rebalancer: string;
  public readonly payrollClerk: string;
  public readonly mockFaucet: string;


  constructor(
      calculator: string,
      reader: string,
      utils: string,
      rebalancer: string,
      payrollClerk: string,
      mockFaucet: string
  ) {
    this.calculator = calculator;
    this.reader = reader;
    this.utils = utils;
    this.rebalancer = rebalancer;
    this.payrollClerk = payrollClerk;
    this.mockFaucet = mockFaucet;
  }
}
