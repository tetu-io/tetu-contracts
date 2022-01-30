import {
  Announcer,
  Bookkeeper,
  Controller,
  ForwarderV2,
  FundKeeper,
  MintHelper,
  NoopStrategy,
  NotifyHelper,
  RewardToken,
  SmartVault,
  VaultController
} from "../typechain";
import {tracer} from "hardhat";

export class CoreContractsWrapper {
  public controller: Controller;
  public controllerLogic: string;
  public feeRewardForwarder: ForwarderV2;
  public feeRewardForwarderLogic: string;
  public bookkeeper: Bookkeeper;
  public bookkeeperLogic: string;
  public notifyHelper: NotifyHelper
  public mintHelper: MintHelper;
  public mintHelperLogic: string;
  public rewardToken: RewardToken;
  public psVault: SmartVault;
  public psVaultLogic: string;
  public psEmptyStrategy: NoopStrategy;
  public fundKeeper: FundKeeper;
  public fundKeeperLogic: string;
  public announcer: Announcer;
  public announcerLogic: string;
  public vaultController: VaultController;
  public vaultControllerLogic: string;

  constructor(controller: Controller,
              controllerLogic: string,
              feeRewardForwarder: ForwarderV2,
              feeRewardForwarderLogic: string,
              bookkeeper: Bookkeeper,
              bookkeeperLogic: string,
              notifyHelper: NotifyHelper,
              mintHelper: MintHelper,
              mintHelperLogic: string,
              rewardToken: RewardToken,
              psVault: SmartVault,
              psVaultLogic: string,
              psEmptyStrategy: NoopStrategy,
              fundKeeper: FundKeeper,
              fundKeeperLogic: string,
              announcer: Announcer,
              announcerLogic: string,
              vaultController: VaultController,
              vaultControllerLogic: string
  ) {
    this.controller = controller;
    this.controllerLogic = controllerLogic;
    this.feeRewardForwarder = feeRewardForwarder;
    this.feeRewardForwarderLogic = feeRewardForwarderLogic;
    this.bookkeeper = bookkeeper;
    this.bookkeeperLogic = bookkeeperLogic;
    this.notifyHelper = notifyHelper;
    this.mintHelper = mintHelper;
    this.mintHelperLogic = mintHelperLogic;
    this.rewardToken = rewardToken;
    this.psVault = psVault;
    this.psVaultLogic = psVaultLogic;
    this.psEmptyStrategy = psEmptyStrategy;
    this.fundKeeper = fundKeeper;
    this.fundKeeperLogic = fundKeeperLogic;
    this.announcer = announcer;
    this.announcerLogic = announcerLogic;
    this.vaultController = vaultController;
    this.vaultControllerLogic = vaultControllerLogic;
  }

  public registerInTracer() {
    if (!tracer) {
      return;
    }
    tracer.nameTags[this.controller.address] = 'controller';
    tracer.nameTags[this.feeRewardForwarder.address] = 'feeRewardForwarder';
    tracer.nameTags[this.bookkeeper.address] = 'bookkeeper';
    tracer.nameTags[this.bookkeeperLogic] = 'bookkeeperLogic';
    tracer.nameTags[this.notifyHelper.address] = 'notifyHelper';
    tracer.nameTags[this.mintHelper.address] = 'mintHelper';
    tracer.nameTags[this.rewardToken.address] = 'rewardToken';
    tracer.nameTags[this.psVault.address] = 'psVault';
    tracer.nameTags[this.psVaultLogic] = 'psVaultLogic';
    tracer.nameTags[this.psEmptyStrategy.address] = 'psEmptyStrategy';
  }
}
