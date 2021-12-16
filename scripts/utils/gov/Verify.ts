import {DeployerUtils} from "../../deploy/DeployerUtils";
import {AaveAmPipe, AaveMaiBalStrategyBase} from "../../../typechain";
import {ethers} from "hardhat";

async function main() {
  const signer = (await ethers.getSigners())[0];
  const core = await DeployerUtils.getCoreAddresses();

  const adrs = [
    "0xcF8E39462985126eDe59814960983F16E378ff8c",
    "0xB6E6A0f377e9950DAECdb6cB9E5B45B4688bFD70",
    "0x5E1BEfD7eAbeFbb2A6Ab88131731772Ccff1be1f",
    "0x96e6A7C9441a1093377D367cb6CAD25AA6EAA0e5",
    "0x47A0eCc413e29DaD8C6589D645979F9e9c7C9DeE",
  ]

  for (const adr of adrs) {
    const strategy = await DeployerUtils.connectInterface(signer, 'AaveMaiBalStrategyBase', adr) as AaveMaiBalStrategyBase;

    const pipesLength = (await strategy.pipesLength()).toNumber();
    for (let i = 0; i < pipesLength; i++) {
      const pipeAdr = await strategy.pipes(i);

      if (i === 0) {
        const aaveAmPipe = await DeployerUtils.connectInterface(signer, 'AaveAmPipe', pipeAdr) as AaveAmPipe;
        const arg = await aaveAmPipe.pipeData();
        await DeployerUtils.verifyWithArgs(pipeAdr, [arg]);
      }

    }

    // await DeployerUtils.verifyWithContractName(adr, 'contracts/strategies/matic/multi/StrategyAaveMaiBal.sol:StrategyAaveMaiBal', [
    //   core.controller,
    //   await strategy.vault(),
    //   await strategy.underlying(),
    //   pipes
    // ]);
  }


}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
