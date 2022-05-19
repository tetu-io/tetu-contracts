import {SpecificStrategyTest} from "../../SpecificStrategyTest";
import {
  IERC20,
  IPoolVoting, ISmartVault, IVotingMesh,
  MeshStakingStrategyBase,
} from "../../../../typechain";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployInfo} from "../../DeployInfo";
import {DeployerUtils} from "../../../../scripts/deploy/DeployerUtils";
import {BigNumber} from "ethers";
import {TimeUtils} from "../../../TimeUtils";

const {expect} = chai;
chai.use(chaiAsPromised);

export class VeMeshSpecificTests extends SpecificStrategyTest {

  public async do(
    deployInfo: DeployInfo
  ): Promise<void> {

    it("Governance should be able to vote", async () => {
      const signer = deployInfo.signer as SignerWithAddress;
      const strategy = deployInfo.strategy as MeshStakingStrategyBase;
      const vault = deployInfo.vault as ISmartVault;
      const poolVoting = await DeployerUtils.connectInterface(signer, "IPoolVoting", "0x705b40Af8CeCd59406cF630Ab7750055c9b137B9") as IPoolVoting;
      const votingMesh = await DeployerUtils.connectInterface(signer, "IVotingMesh", "0x176b29289f66236c65C7ac5DB2400abB5955Df13") as IVotingMesh;
      const underlying = await vault.underlying();
      const meshToken = await DeployerUtils.connectInterface(signer, "contracts/openzeppelin/IERC20.sol:IERC20", underlying) as IERC20;
      const depositAmount = BigNumber.from(10).pow(19);
      await meshToken.approve(vault.address,depositAmount);
      await vault.deposit(depositAmount);
      const lpAddressToVote = "0x6Ffe747579eD4E807Dec9B40dBA18D15226c32dC";
      await strategy.addVoting(lpAddressToVote, 10)
      expect(await poolVoting.userVotingPoolCount(strategy.address)).is.eq(1)
      await TimeUtils.advanceBlocksOnTs(60*60*24*100);
      await strategy.removeVoting(lpAddressToVote, 10)
      expect(await poolVoting.userVotingPoolCount(strategy.address)).is.eq(0)
    });
  }

}
