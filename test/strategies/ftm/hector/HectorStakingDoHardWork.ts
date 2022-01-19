import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {FtmAddresses} from "../../../../scripts/addresses/FtmAddresses";
import {IstHector, RewardToken} from "../../../../typechain";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);


export class HectorStakingDoHardWork extends DoHardWorkLoopBase {

  public async loopStartActions(i: number) {
    await super.loopStartActions(i);
    const gov = await DeployerUtils.impersonate(FtmAddresses.GOV_ADDRESS);
    await this.vault.connect(gov).changeProtectionMode(true);

    const dec = await TokenUtils.decimals(FtmAddresses.HEC_TOKEN);
    const amount = utils.parseUnits('10000', dec);

    const treasury = await DeployerUtils.impersonate(FtmAddresses.HECTOR_TREASURY);
    const hectorCtr = await DeployerUtils.connectInterface(treasury, 'RewardToken', FtmAddresses.HEC_TOKEN) as RewardToken;
    await hectorCtr.mint(FtmAddresses.HECTOR_STAKING, amount);

    const hectorStaking = await DeployerUtils.impersonate(FtmAddresses.HECTOR_STAKING);
    const stHectorCtr = await DeployerUtils.connectInterface(hectorStaking, 'IstHector', FtmAddresses.sHEC) as IstHector;
    await stHectorCtr.rebase(amount, 1);
  }


  public async loopEndActions(i: number) {
    const dec = await TokenUtils.decimals(FtmAddresses.HEC_TOKEN);
    const amount = utils.parseUnits('10000', dec);

    const treasury = await DeployerUtils.impersonate(FtmAddresses.HECTOR_TREASURY);
    const hectorCtr = await DeployerUtils.connectInterface(treasury, 'RewardToken', FtmAddresses.HEC_TOKEN) as RewardToken;
    await hectorCtr.mint(FtmAddresses.HECTOR_STAKING, amount);

    const hectorStaking = await DeployerUtils.impersonate(FtmAddresses.HECTOR_STAKING);
    const stHectorCtr = await DeployerUtils.connectInterface(hectorStaking, 'IstHector', FtmAddresses.sHEC) as IstHector;
    await stHectorCtr.rebase(amount, 1);

    await super.loopEndActions(i);
  }

}
