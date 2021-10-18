import {ToolsAddresses} from "./scripts/models/ToolsAddresses";

export class RinkebyToolsAddresses {

  public static ADDRESSES = new ToolsAddresses(
    '0x9b8205F7fa03FD4DFc29c9b0E553883913ec4132', // calculator
    '0x9B1F56a7cE7529522C2E5F32C13422654808Ea7a', // reader
    '0x51be2Ad4f39CC0f722E6900F1db8cb0196ed01b2', // utils
    '0x56b44897c8333fa08DaEC0dc8c16695750b24c6D', // rebalancer
    '', // payrollClerk
    '0xE08a4d6aFC2f3bB5F95ceC1e4D88559d837C08F2', // mockFaucet
    '0xe5C203ef4CB3E56766E7936fDE4b157209e93dD5', // multiSwap
    '0x9Ff04B5D8f6e7fFF99DBE07CAa9a83467Ec4A1c1', // zapContract
    '', // multicall
    '', // pawnshopReader
  );

}
