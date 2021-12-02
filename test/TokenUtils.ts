import {ethers} from "hardhat";
import {ERC20, ERC721, IERC20, IERC721Enumerable, IWmatic, RewardToken} from "../typechain";
import {BigNumber, utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {MaticAddresses} from "../scripts/addresses/MaticAddresses";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {DeployerUtils} from "../scripts/deploy/DeployerUtils";
import {FtmAddresses} from "../scripts/addresses/FtmAddresses";
import {Misc} from "../scripts/utils/tools/Misc";

const {expect} = chai;
chai.use(chaiAsPromised);

export class TokenUtils {

  // use the most neutral place, some contracts (like swap pairs) can be used in tests and direct transfer ruin internal logic
  public static TOKEN_HOLDERS = new Map<string, string>([
    [MaticAddresses.WMATIC_TOKEN, '0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4'.toLowerCase()], // aave
    [MaticAddresses.WETH_TOKEN, '0x28424507fefb6f7f8e9d3860f56504e4e5f5f390'.toLowerCase()], // aave
    [MaticAddresses.WBTC_TOKEN, '0xba12222222228d8ba445958a75a0704d566bf2c8'.toLowerCase()], // bal
    // [MaticAddresses.USDC_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // bal
    [MaticAddresses.USDC_TOKEN, '0x5D6Fcf22Aa4e4Ff8dA0abE329392E7c5306D22F3'.toLowerCase()], // bal
    [MaticAddresses.USDT_TOKEN, '0x0D0707963952f2fBA59dD06f2b425ace40b492Fe'.toLowerCase()], // adr
    [MaticAddresses.QUICK_TOKEN, '0xdB74C5D4F154BBD0B8e0a28195C68ab2721327e5'.toLowerCase()], // dquick
    [MaticAddresses.FRAX_TOKEN, '0x45c32fa6df82ead1e2ef74d17b76547eddfaff89'.toLowerCase()], // frax
    [MaticAddresses.TETU_TOKEN, '0x7ad5935ea295c4e743e4f2f5b4cda951f41223c2'.toLowerCase()], // fund keeper
    [MaticAddresses.AAVE_TOKEN, '0x1d2a0e5ec8e5bbdca5cb219e649b565d8e5c3360'.toLowerCase()], // aave
    [MaticAddresses.SUSHI_TOKEN, '0x1b1cd0fdb6592fe482026b8e47706eac1ee94a7c'.toLowerCase()], // peggy
    [MaticAddresses.pBREW_TOKEN, '0x000000000000000000000000000000000000dead'.toLowerCase()], // burned
    [MaticAddresses.DINO_TOKEN, '0x000000000000000000000000000000000000dead'.toLowerCase()], // burned
    [MaticAddresses.ICE_TOKEN, '0xb1bf26c7b43d2485fa07694583d2f17df0dde010'.toLowerCase()], // blueIce
    [MaticAddresses.IRON_TOKEN, '0xCaEb732167aF742032D13A9e76881026f91Cd087'.toLowerCase()], // ironSwap
    [MaticAddresses.DAI_TOKEN, '0x9b17bAADf0f21F03e35249e0e59723F34994F806'.toLowerCase()], // anyswap
    [MaticAddresses.LINK_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // balancer
    [MaticAddresses.CRV_TOKEN, '0x98B5F32dd9670191568b661a3e847Ed764943875'.toLowerCase()], // qi
    [MaticAddresses.DINO_TOKEN, '0x000000000000000000000000000000000000dead'.toLowerCase()], //
    [FtmAddresses.USDC_TOKEN, '0xe578c856933d8e1082740bf7661e379aa2a30b26'.toLowerCase()], // geist
    [FtmAddresses.fUSDT_TOKEN, '0x940f41f0ec9ba1a34cf001cc03347ac092f5f6b5'.toLowerCase()], // geist
    [FtmAddresses.FTM_TOKEN, '0x39b3bd37208cbade74d0fcbdbb12d606295b430a'.toLowerCase()], // geist
    [MaticAddresses.FXS_TOKEN, '0x1a3acf6d19267e2d3e7f898f42803e90c9219062'.toLowerCase()], // itself
    [MaticAddresses.AM3CRV_TOKEN, '0xA1C4Aac752043258c1971463390013e6082C106f'.toLowerCase()], // wallet
    [MaticAddresses.USD_BTC_ETH_CRV_TOKEN, '0x5342D9085765baBF184e7bBa98C9CB7528dfDACE'.toLowerCase()], // wallet
    [MaticAddresses.BTCCRV_TOKEN, '0xffbACcE0CC7C19d46132f1258FC16CF6871D153c'.toLowerCase()], // gauge
    [MaticAddresses.IRON_IS3USD, '0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD'.toLowerCase()], // chef
    [MaticAddresses.IRON_IRON_IS3USD, '0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD'.toLowerCase()], // chef
    [FtmAddresses.TETU_TOKEN, '0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD'.toLowerCase()], // chef
    [FtmAddresses.DAI_TOKEN, '0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E'.toLowerCase()], // itself
  ]);

  public static async balanceOf(tokenAddress: string, account: string): Promise<BigNumber> {
    const token = await ethers.getContractAt("IERC20", tokenAddress) as IERC20;
    return token.balanceOf(account);
  }

  public static async totalSupply(tokenAddress: string): Promise<BigNumber> {
    const token = await ethers.getContractAt("IERC20", tokenAddress) as IERC20;
    return token.totalSupply();
  }

  public static async approve(tokenAddress: string, signer: SignerWithAddress, spender: string, amount: string) {
    console.log('approve', await TokenUtils.tokenSymbol(tokenAddress), amount);
    //await TokenUtils.checkBalance(tokenAddress, signer.address, amount);
    const token = await ethers.getContractAt("IERC20", tokenAddress, signer) as IERC20;
    return token.approve(spender, BigNumber.from(amount));
  }

  public static async approveNFT(tokenAddress: string, signer: SignerWithAddress, spender: string, id: string) {
    console.log('approve', await TokenUtils.tokenSymbol(tokenAddress), id);
    await TokenUtils.checkNftBalance(tokenAddress, signer.address, id);
    const token = await ethers.getContractAt("ERC721", tokenAddress, signer) as ERC721;
    return token.approve(spender, id);
  }

  public static async allowance(tokenAddress: string, signer: SignerWithAddress, spender: string): Promise<BigNumber> {
    const token = await ethers.getContractAt("IERC20", tokenAddress, signer) as IERC20;
    return token.allowance(signer.address, spender);
  }

  public static async transfer(tokenAddress: string, signer: SignerWithAddress, destination: string, amount: string) {
    console.log('transfer', await TokenUtils.tokenSymbol(tokenAddress), amount);
    const token = await ethers.getContractAt("IERC20", tokenAddress, signer) as IERC20;
    return token.transfer(destination, BigNumber.from(amount))
  }

  public static async wrapNetworkToken(signer: SignerWithAddress, amount: string) {
    const token = await ethers.getContractAt("IWmatic", await DeployerUtils.getNetworkTokenAddress(), signer) as IWmatic;
    return token.deposit({value: utils.parseUnits(amount, 18).toString()})
  }

  public static async decimals(tokenAddress: string): Promise<number> {
    const token = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;
    return token.decimals();
  }

  public static async tokenName(tokenAddress: string): Promise<string> {
    const token = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;
    return token.name();
  }

  public static async tokenSymbol(tokenAddress: string): Promise<string> {
    const token = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;
    return token.symbol();
  }

  public static async checkBalance(tokenAddress: string, account: string, amount: string) {
    const bal = await TokenUtils.balanceOf(tokenAddress, account);
    expect(bal.gt(BigNumber.from(amount))).is.eq(true, 'Balance less than amount');
    return bal;
  }

  public static async tokenOfOwnerByIndex(tokenAddress: string, account: string, index: number) {
    const token = await ethers.getContractAt("IERC721Enumerable", tokenAddress) as IERC721Enumerable;
    return token.tokenOfOwnerByIndex(account, index);
  }

  public static async checkNftBalance(tokenAddress: string, account: string, id: string) {
    const nftCount = (await TokenUtils.balanceOf(tokenAddress, account)).toNumber();
    let found = false;
    let tokenId;
    for (let i = 0; i < nftCount; i++) {
      tokenId = await TokenUtils.tokenOfOwnerByIndex(tokenAddress, account, i);
      console.log('NFT', tokenId)
      if (tokenId.toString() === id) {
        found = true;
        break;
      }
    }
    expect(found).is.eq(true);
    return tokenId;
  }

  public static async getToken(token: string, to: string, amount?: BigNumber) {
    const start = Date.now();
    console.log('transfer token from biggest holder', token, amount?.toString());
    if (token.toLowerCase() === FtmAddresses.TETU_TOKEN) {
      const minter = await DeployerUtils.impersonate('0x25864a712C80d33Ba1ad7c23CffA18b46F2fc00c');
      const tokenCtr = await DeployerUtils.connectInterface(minter, 'RewardToken', FtmAddresses.TETU_TOKEN) as RewardToken
      await tokenCtr.mint(to, amount as BigNumber);
      return amount;
    }
    const holder = TokenUtils.TOKEN_HOLDERS.get(token.toLowerCase()) as string;
    if (!holder) {
      throw new Error('Please add holder for ' + token);
    }
    const signer = await DeployerUtils.impersonate(holder);
    const balance = (await TokenUtils.balanceOf(token, holder)).div(100);
    console.log('holder balance', balance.toString());
    if (amount) {
      await TokenUtils.transfer(token, signer, to, amount.toString());
    } else {
      await TokenUtils.transfer(token, signer, to, balance.toString());
    }
    Misc.printDuration('getToken completed', start);
    return balance;
  }

}
