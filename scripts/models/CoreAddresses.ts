export class CoreAddresses {
  public readonly controller: string;
  public readonly feeRewardForwarder: string;
  public readonly bookkeeper: string;
  public readonly notifyHelper: string;
  public readonly mintHelper: string;
  public readonly rewardToken: string;
  public readonly psVault: string;


  constructor(
      controller: string,
      feeRewardForwarder: string,
      bookkeeper: string,
      notifyHelper: string,
      mintHelper: string,
      rewardToken: string,
      psVault: string
  ) {
    this.controller = controller;
    this.feeRewardForwarder = feeRewardForwarder;
    this.bookkeeper = bookkeeper;
    this.notifyHelper = notifyHelper;
    this.mintHelper = mintHelper;
    this.rewardToken = rewardToken;
    this.psVault = psVault;
  }
}
