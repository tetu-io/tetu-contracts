export class Secrets {
  public static infuraKey = '';
  public static ropstenPrivateKey = '';
  public static ropstenPrivateKey2 = '';
  public static mumbaiPrivateKey = '';
  public static etherscanKey = '';
  public static polyscanKey = '';
  public static maticRpcUrl = '';

  public static getNetworkScanKey() {
    return Secrets.etherscanKey;
  }
}
