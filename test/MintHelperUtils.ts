import { utils } from 'ethers';
import { Announcer, Controller } from '../typechain';
import { TimeUtils } from './TimeUtils';
import { TokenUtils } from './TokenUtils';
import { DeployerUtils } from '../scripts/deploy/DeployerUtils';

export class MintHelperUtils {
  public static async mint(
    controller: Controller,
    announcer: Announcer,
    amount: string,
    destination: string,
    mintAll = false,
    period = 60 * 60 * 48
  ) {
    const fund = await controller.fund();
    const distributor = await controller.distributor();
    console.log('mint reward tokens', amount);
    await announcer.announceMint(
      utils.parseUnits(amount),
      distributor,
      fund,
      mintAll
    );

    await TimeUtils.advanceBlocksOnTs(period);

    await controller.mintAndDistribute(utils.parseUnits(amount), mintAll);
    const tetu = await controller.rewardToken();
    const fundBal = await TokenUtils.balanceOf(tetu, fund);
    const distBal = await TokenUtils.balanceOf(tetu, distributor);
    await TokenUtils.transfer(
      tetu,
      await DeployerUtils.impersonate(fund),
      destination,
      fundBal.toString()
    );
    await TokenUtils.transfer(
      tetu,
      await DeployerUtils.impersonate(distributor),
      destination,
      distBal.toString()
    );
  }
}
