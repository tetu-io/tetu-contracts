import {CoreAddresses} from "./scripts/models/CoreAddresses";

export class RinkebyCoreAddress {

  public static ADDRESSES = new CoreAddresses(
    '0x423394A1723C81a2a9E3Ee1852Bc55Db7B85bfE1', // controller
    '0x42A323CF86FE5E8c2B1aAb8C38F7Cd6bd4f05c9c', // announcer
    '0x472a3B6DB960407378BF8b51Ee3b841Ee281d06D', // forwarder
    '0xFB1e7bF70FFBbD195c692AA79F2721e0143A42Bc', // bookkeeper
    '0x44487fB06DF0E2712c13f617C46301301B1B8B88', // notifier
    '0x2eABFA0f09D3F393beC9Efb102066733c0030D36', // mint helper
    '0x4604E8C1504F0F95DB69d23EADeae699ACd93feB', // tetu token
    '0xAec561cF4F54756EBB9E897b7fdbb444DE8783bA', // ps vault
    '0x1b6E2a7AcB8f79044bE4b384fa7A1Cac1259bb72', // fund keeper
    '0xb990e66DAbda0a30a6d79fe9e7f5aeD36E59156b', // vault controller
    '', // pawnshop
    '', // swapFactory
    '', // swapRouter
    '', // rewardCalculator
    '', // autoRewarder
  );

}
