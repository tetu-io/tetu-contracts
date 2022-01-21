import { ethers } from "hardhat";
import { DeployerUtils } from "../../deploy/DeployerUtils";
import { IUniswapV2Pair } from "../../../typechain";
import { TokenUtils } from "../../../test/TokenUtils";
import { UniswapUtils } from "../../../test/UniswapUtils";
import { BigNumber, utils } from "ethers";
import { RunHelper } from "../tools/RunHelper";
import { RopstenAddresses } from "../../addresses/RopstenAddresses";

async function main() {
  const BASE_AMOUNT = 1000;
  const core = await DeployerUtils.getCoreAddresses();
  const signer = (await ethers.getSigners())[1];
  const mocks = await DeployerUtils.getTokenAddresses();
  const net = (await ethers.provider.getNetwork()).name;
  const targetToken = core.rewardToken;
  const targetLpAddress = mocks.get("sushi_lp_token_usdc") as string;
  const targetLp = (await DeployerUtils.connectInterface(
    signer,
    "IUniswapV2Pair",
    targetLpAddress
  )) as IUniswapV2Pair;
  const token0 = await targetLp.token0();
  const token1 = await targetLp.token1();

  let oppositeToken;
  if (token0.toLowerCase() === targetToken.toLowerCase()) {
    oppositeToken = token1;
  } else {
    oppositeToken = token0;
  }
  const oppositeTokenDecimals = await TokenUtils.decimals(oppositeToken);

  let router: string;
  if (net === "ropsten" || net === "rinkeby") {
    router = RopstenAddresses.SUSHI_ROUTER;
  } else {
    throw Error("Unknown net " + net);
  }

  // noinspection InfiniteLoopJS
  while (true) {
    let buy = true;
    if (Math.random() > 0.5) {
      buy = false;
    }

    const baseAmount: number = 1 + +(Math.random() * BASE_AMOUNT).toFixed();

    let route: string[];
    let amount: BigNumber;
    if (buy) {
      route = [oppositeToken, targetToken];
      amount = utils.parseUnits(baseAmount.toString(), oppositeTokenDecimals);
    } else {
      route = [targetToken, oppositeToken];
      amount = utils.parseUnits(baseAmount.toString());
    }

    console.log(
      "######################### TRANSACTION ##############################\n" +
        "# Buy?:        " +
        buy +
        "\n" +
        "# Amount:      " +
        baseAmount +
        "\n" +
        "######################################################################"
    );

    await RunHelper.runAndWait(
      async () =>
        UniswapUtils.swapExactTokensForTokens(
          signer,
          route,
          amount.toString(),
          signer.address,
          router
        ),
      true
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
