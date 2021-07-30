export class Settings {
  public static disableStrategyTests = false;
  public static onlyOneQuickStrategyTest = null;
  public static onlyOneSushiStrategyTest = null;
  public static onlyOneWaultStrategyTest = null;

  public static mockBatchDeployCount = 1;
  public static mockBatchDeployVersion = '0';

  // Liquidity Balancer settings
  public static lbTargetPrice = 1;
  public static lbTargetTvl = 1_000_000;
  public static lbSkipUseless = true;
  public static lbFastMod = false;

  // strategy deploy settings
  public static excludeStrategyDeployQuick = [];
  public static excludeStrategyDeploySushi = [];
  public static excludeStrategyDeployWault = [];
}
