import {
  ContractReader,
  ContractUtils,
  LiquidityBalancer,
  MockFaucet,
  Multicall,
  MultiSwap,
  PawnShopReader,
  PayrollClerk,
  PriceCalculator,
  ZapContract,
} from '../typechain';

export class ToolsContractsWrapper {
  public readonly calculator: PriceCalculator;
  public readonly reader: ContractReader;
  public readonly utils: ContractUtils;
  public readonly rebalancer: LiquidityBalancer;
  public readonly payrollClerk: PayrollClerk;
  public readonly mockFaucet: MockFaucet;
  public readonly multiSwap: MultiSwap;
  public readonly zapContract: ZapContract;
  public readonly multicall: Multicall;
  public readonly pawnshopReader: PawnShopReader;

  constructor(
    calculator: PriceCalculator,
    reader: ContractReader,
    utils: ContractUtils,
    rebalancer: LiquidityBalancer,
    payrollClerk: PayrollClerk,
    mockFaucet: MockFaucet,
    multiSwap: MultiSwap,
    zapContract: ZapContract,
    multicall: Multicall,
    pawnshopReader: PawnShopReader,
  ) {
    this.calculator = calculator;
    this.reader = reader;
    this.utils = utils;
    this.rebalancer = rebalancer;
    this.payrollClerk = payrollClerk;
    this.mockFaucet = mockFaucet;
    this.multiSwap = multiSwap;
    this.zapContract = zapContract;
    this.multicall = multicall;
    this.pawnshopReader = pawnshopReader;
  }
}
