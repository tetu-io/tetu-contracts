import {
  ContractReader,
  ContractUtils,
  MockFaucet,
  Multicall,
  PawnShopReader,
  PriceCalculator,
} from "../typechain";

export class ToolsContractsWrapper {
  public readonly calculator: PriceCalculator;
  public readonly reader: ContractReader;
  public readonly utils: ContractUtils;
  public readonly mockFaucet: MockFaucet;
  public readonly multicall: Multicall;
  public readonly pawnshopReader: PawnShopReader;


  constructor(
    calculator: PriceCalculator,
    reader: ContractReader,
    utils: ContractUtils,
    mockFaucet: MockFaucet,
    multicall: Multicall,
    pawnshopReader: PawnShopReader
  ) {
    this.calculator = calculator;
    this.reader = reader;
    this.utils = utils;
    this.mockFaucet = mockFaucet;
    this.multicall = multicall;
    this.pawnshopReader = pawnshopReader;
  }
}
