import {ethers} from "hardhat";
import {DeployerUtils} from "../../deploy/DeployerUtils";
import {Bookkeeper} from "../../../typechain";
import {Erc20Utils} from "../../../test/Erc20Utils";
import {utils} from "ethers";
import {RunHelper} from "../RunHelper";
import {VaultUtils} from "../../../test/VaultUtils";


async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[0];
  const bookkeeper = await DeployerUtils.connectContract(
      signer, "Bookkeeper", core.bookkeeper) as Bookkeeper;
  const percentOfBalance = 0.001;
  const vaults = await bookkeeper.vaults();
  console.log('vaults ', vaults.length);

  for (let vault of vaults) {
    const vaultContract = await DeployerUtils.connectVault(vault, signer);
    if (!(await vaultContract.active())) {
      console.log('inactive ', await vaultContract.name());
      continue;
    }

    const underlying = await vaultContract.underlying();
    const decimals = await vaultContract.decimals();

    const vaultBalance = await vaultContract.underlyingBalanceWithInvestmentForHolder(signer.address);
    if (!vaultBalance.isZero()) {
      console.log('already deposited', utils.formatUnits(vaultBalance, decimals));
      continue;
    }

    const availableAmount = +utils.formatUnits(await Erc20Utils.balanceOf(underlying, signer.address), decimals);
    if (availableAmount === 0) {
      console.error('zero balance', await Erc20Utils.tokenSymbol(underlying), underlying);
      continue;
    }
    console.log("availableAmount", availableAmount)
    const depositN = ((availableAmount * percentOfBalance) * Math.random()) + (availableAmount * percentOfBalance);
    console.log("depositN", depositN);

    const deposit = utils.parseUnits(depositN.toFixed(decimals), decimals);
    await RunHelper.runAndWait(() => VaultUtils.deposit(signer, vaultContract, deposit));

    console.log('deposited ', await vaultContract.name(), depositN, 'availableAmount', availableAmount)
  }
}

main()
.then(() => process.exit(0))
.catch(error => {
  console.error(error);
  process.exit(1);
});
