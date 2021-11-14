import {CoreAddresses} from "./scripts/models/CoreAddresses";

export class FtmCoreAddresses {

  public static ADDRESSES = new CoreAddresses(
    '0x22e2625F9d8c28CB4BcE944E9d64efb4388ea991', // controller
    '0xA43eA51b3251f96bB48c48567A93b15e7e4b99F6', // announcer
    '0xd353254872E8797B159594c1E528b8Be9a6cb1F8', // forwarder
    '0x00379dD90b2A337C4652E286e4FBceadef940a21', // bookkeeper
    '', // notifier
    '', // mint helper
    '', // tetu token
    '', // ps vault
    '0x81367059892aa1D8503a79a0Af9254DD0a09afBF', // fund keeper
    '0xA43eA51b3251f96bB48c48567A93b15e7e4b99F6', // vault controller
    '', // pawnshop
    '', // swapFactory
    '', // swapRouter
    '', // rewardCalculator
    '', // autoRewarder
  );

}
