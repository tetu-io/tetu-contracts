import {DoHardWorkLoopBase} from "../../DoHardWorkLoopBase";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {MaticAddresses} from "../../../../scripts/addresses/MaticAddresses";
import {IstKlima, RewardToken} from "../../../../typechain";
import {utils} from "ethers";
import {TokenUtils} from "../../../TokenUtils";

const {expect} = chai;
chai.use(chaiAsPromised);


export class VesqStakingDoHardWork extends DoHardWorkLoopBase {

  public async loopStartActions(i: number) {
    await super.loopStartActions(i);
    const gov = await DeployerUtils.impersonate(MaticAddresses.GOV_ADDRESS);
    await this.vault.connect(gov).changeProtectionMode(true);

    const dec = await TokenUtils.decimals(MaticAddresses.VSQ_TOKEN);
    const amount = utils.parseUnits('10000', dec);

    const treasury = await DeployerUtils.impersonate(MaticAddresses.VESQ_TREASURY);
    const klimaCtr = await DeployerUtils.connectInterface(treasury, 'RewardToken', MaticAddresses.VSQ_TOKEN) as RewardToken;
    await klimaCtr.mint(MaticAddresses.VESQ_STAKING, amount);

    const klimaStaking = await DeployerUtils.impersonate(MaticAddresses.VESQ_STAKING);
    const stKlimaCtr = await DeployerUtils.connectInterface(klimaStaking, 'IstKlima', MaticAddresses.sVESQ) as IstKlima;
    await stKlimaCtr.rebase(amount, 1);
  }


  public async loopEndActions(i: number) {
    const dec = await TokenUtils.decimals(MaticAddresses.VSQ_TOKEN);
    const amount = utils.parseUnits('10000', dec);

    const treasury = await DeployerUtils.impersonate(MaticAddresses.VESQ_TREASURY);
    const klimaCtr = await DeployerUtils.connectInterface(treasury, 'RewardToken', MaticAddresses.VSQ_TOKEN) as RewardToken;
    await klimaCtr.mint(MaticAddresses.VESQ_STAKING, amount);

    const klimaStaking = await DeployerUtils.impersonate(MaticAddresses.VESQ_STAKING);
    const stKlimaCtr = await DeployerUtils.connectInterface(klimaStaking, 'IstKlima', MaticAddresses.sVESQ) as IstKlima;
    await stKlimaCtr.rebase(amount, 1);

    await super.loopEndActions(i);
  }

}
