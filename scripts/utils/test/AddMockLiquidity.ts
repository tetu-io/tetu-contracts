import { ethers } from "hardhat";
import { DeployerUtils } from "../../deploy/DeployerUtils";
import { utils } from "ethers";
import { UniswapUtils } from "../../../test/UniswapUtils";
import { TokenUtils } from "../../../test/TokenUtils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { RunHelper } from "../tools/RunHelper";
import { RopstenAddresses } from "../../addresses/RopstenAddresses";

async function main() {
  const core = await DeployerUtils.getCoreAddresses();
  const mocks = await DeployerUtils.getTokenAddresses();
  const signer = (await ethers.getSigners())[0];
  const base = 100_000;
  let prevMock;
  let prevMockName;

  for (const mockName of Array.from(mocks.keys())) {
    const mock = mocks.get(mockName) as string;
    if (!mock) {
      console.log("empty mock", mockName);
      continue;
    }
    if (mockName === "sushi_lp_token_usdc") {
      continue;
    }
    const decimals = await TokenUtils.decimals(mock);

    // const mockContract = await DeployerUtils.connectContract(signer, "ERC20PresetMinterPauser", mock) as ERC20PresetMinterPauser;
    // await mockContract.mint(signer.address, utils.parseUnits("10000", decimals));

    const mockBal = await TokenUtils.balanceOf(mock, signer.address);
    console.log("mockBal", mockName, utils.formatUnits(mockBal, decimals));

    const lp = await UniswapUtils.addLiquidity(
      signer,
      core.rewardToken,
      mock,
      utils.parseUnits((Math.random() * base + base).toFixed(), 18).toString(),
      utils
        .parseUnits((Math.random() * base + base).toFixed(), decimals)
        .toString(),
      RopstenAddresses.SUSHI_FACTORY,
      RopstenAddresses.SUSHI_ROUTER,
      true
    );
    console.log("liquidity added to Reward TOKEN and", mockName, lp);

    if (mockName !== "usdc") {
      const nonUsdclp = await UniswapUtils.addLiquidity(
        signer,
        mocks.get("usdc") as string,
        mock,
        utils.parseUnits((Math.random() * base + base).toFixed(), 6).toString(),
        utils
          .parseUnits((Math.random() * base + base).toFixed(), decimals)
          .toString(),
        RopstenAddresses.SUSHI_FACTORY,
        RopstenAddresses.SUSHI_ROUTER,
        true
      );
      console.log("liquidity added to usdc ", mockName, nonUsdclp);
    }

    if (prevMock) {
      const prevMockDecimals = await TokenUtils.decimals(prevMock);
      const prevMocklp = await UniswapUtils.addLiquidity(
        signer,
        prevMock,
        mock,
        utils
          .parseUnits((Math.random() * base + base).toFixed(), prevMockDecimals)
          .toString(),
        utils
          .parseUnits((Math.random() * base + base).toFixed(), decimals)
          .toString(),
        RopstenAddresses.SUSHI_FACTORY,
        RopstenAddresses.SUSHI_ROUTER,
        true
      );
      console.log("liquidity added to", mockName, prevMockName, prevMocklp);
    }

    prevMock = mock;
    prevMockName = mockName;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

async function addLiquidityWithWait(
  sender: SignerWithAddress,
  tokenA: string,
  tokenB: string,
  amountA: string,
  amountB: string,
  _factory: string,
  _router: string
): Promise<string> {
  const router = await UniswapUtils.connectRouter(_router, sender);
  await TokenUtils.approve(tokenA, sender, router.address, amountA);
  await TokenUtils.approve(tokenB, sender, router.address, amountB);
  await RunHelper.runAndWait(() =>
    router.addLiquidity(
      tokenA,
      tokenB,
      amountA,
      amountB,
      1,
      1,
      sender.address,
      "1000000000000"
    )
  );

  const factory = await UniswapUtils.connectFactory(_factory, sender);
  return factory.getPair(tokenA, tokenB);
}
