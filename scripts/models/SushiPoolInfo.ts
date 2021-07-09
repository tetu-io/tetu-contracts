export class SushiPoolInfo {

  address: string;
  name: string;
  token0: string;
  token0Name: string;
  token1: string;
  token1Name: string;


  constructor(address: string, name: string, token0: string, token0Name: string, token1: string, token1Name: string) {
    this.address = address;
    this.name = name;
    this.token0 = token0;
    this.token0Name = token0Name;
    this.token1 = token1;
    this.token1Name = token1Name;
  }
}
