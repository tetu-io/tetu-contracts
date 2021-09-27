export class ToolsAddresses {
  public readonly calculator: string;
  public readonly reader: string;
  public readonly utils: string;
  public readonly rebalancer: string;
  public readonly payrollClerk: string;
  public readonly mockFaucet: string;
  public readonly multiSwap: string;
  public readonly zapContract: string;
  public readonly zapContractIron: string;
  public readonly multicall: string;

  constructor(
      calculator: string,
      reader: string,
      utils: string,
      rebalancer: string,
      payrollClerk: string,
      mockFaucet: string,
      multiSwap: string,
      zapContract: string,
      zapContractIron: string,
      multicall: string
  ) {
    this.calculator = calculator;
    this.reader = reader;
    this.utils = utils;
    this.rebalancer = rebalancer;
    this.payrollClerk = payrollClerk;
    this.mockFaucet = mockFaucet;
    this.multiSwap = multiSwap;
    this.zapContract = zapContract;
    this.zapContractIron = zapContractIron;
    this.multicall = multicall;
  }
}
