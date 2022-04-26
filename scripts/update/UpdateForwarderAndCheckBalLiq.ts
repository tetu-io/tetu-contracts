import {ethers, network} from "hardhat";
import {DeployerUtils} from "../deploy/DeployerUtils";
import {Announcer, Controller, ForwarderV2} from "../../typechain";
import {MaticAddresses} from "../addresses/MaticAddresses";
import {balInfo} from "../deploy/base/info/ForwarderBalInfo";
import {TokenUtils} from "../../test/TokenUtils";
import {utils} from "ethers";
import {assert} from "chai";


async function main() {
  const signer = (await ethers.getSigners())[0];

  const logic = await DeployerUtils.deployContract(signer, "ForwarderV2") as ForwarderV2;

  await DeployerUtils.wait(5);
  await DeployerUtils.verify(logic.address);

  if (network.name !== 'hardhat') return;

  // Checking upgrade procedure

  const gov = await DeployerUtils.impersonate(MaticAddresses.GOV_ADDRESS);
  const core = await DeployerUtils.getCoreAddresses();
  const controller = await DeployerUtils.connectInterface(gov, 'Controller', core.controller) as Controller;
  const announcer = await DeployerUtils.connectInterface(gov, 'Announcer', core.announcer) as Announcer;

  const forwarder = await DeployerUtils.connectInterface(signer, 'ForwarderV2', core.feeRewardForwarder) as ForwarderV2;
  const forwarderGov = await DeployerUtils.connectInterface(gov, 'ForwarderV2', core.feeRewardForwarder) as ForwarderV2;
  const versionBefore = await forwarder.VERSION();
  console.log('forwarder version before upgrade', versionBefore);
  assert(versionBefore === '1.2.4', "!!! version before !== '1.2.4' !!!");

  await announcer.announceTetuProxyUpgrade(core.feeRewardForwarder, logic.address);
  const timeLockSec = (await announcer.timeLock()).toNumber();
  console.log('timeLockSec', timeLockSec);
  await network.provider.send("evm_increaseTime", [timeLockSec+1])
  await network.provider.send("evm_mine")
  const upgradeTx = await controller.upgradeTetuProxyBatch([core.feeRewardForwarder], [logic.address]);
  await upgradeTx.wait();

  const version = await forwarder.VERSION();
  console.log('forwarder version', version);
  assert(version === '1.4.0', "!!! version !== '1.4.0' !!!");

  // test liq w/o data
  const usdc = await DeployerUtils.getUSDCAddress();
  const bal = MaticAddresses.BAL_TOKEN;
  const dec = await TokenUtils.decimals(bal);
  const _amount = utils.parseUnits('1000', dec);
  const _amountToGet = _amount.mul(4);
  await TokenUtils.getToken(bal, signer.address, _amountToGet);
  await TokenUtils.approve(bal, signer, forwarder.address, _amountToGet.toString());
  const balBefore0 = await TokenUtils.balanceOf(bal, signer.address)
  console.log('balBefore0', balBefore0);

  console.log('1 ----- liq BAL to USDC using uniswap pool. amount', _amount.toString());
  const usdcBefore1 = await TokenUtils.balanceOf(usdc, signer.address)
  await forwarder.liquidate(bal, usdc, _amount);
  const usdcAfter1 = await TokenUtils.balanceOf(usdc, signer.address)
  const usdcOut1 = usdcAfter1.sub(usdcBefore1);
  console.log('usdcOut1', usdcOut1.toString());

  console.log('2 ----- liq BAL to TETU using uniswap pool. amount', _amount.toString())
  const tetu = MaticAddresses.TETU_TOKEN; // test with real TETU, not core.rewardToken.address;
  const tetuBefore1 = await TokenUtils.balanceOf(tetu, signer.address)
  await forwarder.liquidate(bal, tetu, _amount);
  const tetuAfter1 = await TokenUtils.balanceOf(tetu, signer.address)
  const tetuOut1 = tetuAfter1.sub(tetuBefore1);
  console.log('tetuOut1', tetuOut1.toString());

  // init Bal Data
  await forwarderGov.setBalData(
      balInfo.balToken,
      balInfo.vault,
      balInfo.pool,
      balInfo.tokenOut
  );

  const balData = await forwarder.getBalData();
  console.log('balData', balData);

  console.log('3 ----- liq BAL to USDC using Balancer. amount', _amount.toString());
  const usdcBefore2 = await TokenUtils.balanceOf(usdc, signer.address)
  await forwarder.liquidate(bal, usdc, _amount);
  const usdcAfter2 = await TokenUtils.balanceOf(usdc, signer.address)
  const usdcOut2 = usdcAfter2.sub(usdcBefore2);
  console.log('usdcOut2', usdcOut2.toString());
  const increasePercentsUsdc = usdcOut2.mul(100).div(usdcOut1);
  console.log('increasePercentsUsdc', increasePercentsUsdc.toString());
  assert(usdcOut2.gt(usdcOut1), '!!! usdcOut2 less usdcOut1 !!!');

  console.log('4 ----- liq BAL to TETU using Balancer. amount', _amount.toString())
  const tetuBefore2 = await TokenUtils.balanceOf(tetu, signer.address)
  await forwarder.liquidate(bal, tetu, _amount);
  const tetuAfter2 = await TokenUtils.balanceOf(tetu, signer.address)
  const tetuOut2 = tetuAfter2.sub(tetuBefore2);
  console.log('tetuOut2', tetuOut2.toString());
  const increasePercentsTetu = tetuOut2.mul(100).div(tetuOut1);
  console.log('increasePercentsTetu', increasePercentsTetu.toString());
  assert(tetuOut2.gt(tetuOut1), '!!! tetuOut2 less tetuOut1 !!!');
  console.log('+OK');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
