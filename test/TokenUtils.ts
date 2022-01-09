import {ethers} from "hardhat";
import {ERC20__factory, IERC721Enumerable__factory, IWmatic, RewardToken} from "../typechain";
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
    [MaticAddresses.WBTC_TOKEN, '0x070f5A78963a658d3b8700BAF8e3C08984514eA2'.toLowerCase()],
    // [MaticAddresses.WBTC_TOKEN, '0xba12222222228d8ba445958a75a0704d566bf2c8'.toLowerCase()], // bal
    // [MaticAddresses.USDC_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // bal
    [MaticAddresses.USDC_TOKEN, '0x1a13f4ca1d028320a707d99520abfefca3998b7f'.toLowerCase()], // aave
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
    // [MaticAddresses.DAI_TOKEN, '0x9b17bAADf0f21F03e35249e0e59723F34994F806'.toLowerCase()], // anyswap
    [MaticAddresses.DAI_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // balancer
    [MaticAddresses.LINK_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // balancer
    [MaticAddresses.CRV_TOKEN, '0x98B5F32dd9670191568b661a3e847Ed764943875'.toLowerCase()], // qi
    [MaticAddresses.DINO_TOKEN, '0x000000000000000000000000000000000000dead'.toLowerCase()], //
    [FtmAddresses.USDC_TOKEN, '0xe578c856933d8e1082740bf7661e379aa2a30b26'.toLowerCase()], // geist
    [FtmAddresses.fUSDT_TOKEN, '0x940f41f0ec9ba1a34cf001cc03347ac092f5f6b5'.toLowerCase()], // geist
    [FtmAddresses.WFTM_TOKEN, '0x39b3bd37208cbade74d0fcbdbb12d606295b430a'.toLowerCase()], // geist
    [FtmAddresses.WBTC_TOKEN, '0x38aca5484b8603373acc6961ecd57a6a594510a3'.toLowerCase()], // geist
    [FtmAddresses.CRV_TOKEN, '0xd4F94D0aaa640BBb72b5EEc2D85F6D114D81a88E'.toLowerCase()], // geist
    [FtmAddresses.YFI_TOKEN, '0x0845c0bfe75691b1e21b24351aac581a7fb6b7df'.toLowerCase()], // yearn
    [FtmAddresses.FUSD_TOKEN, '0x3bfC4807c49250b7D966018EE596fd9D5C677e3D'.toLowerCase()], // wallet
    [FtmAddresses.LINK_TOKEN, '0xd061c6586670792331E14a80f3b3Bb267189C681'.toLowerCase()], // Spirit LPs (SPIRIT-LP)
    [FtmAddresses.DOLA_TOKEN, '0x4d7928e993125A9Cefe7ffa9aB637653654222E2'.toLowerCase()], // xChainFed
    [FtmAddresses.MIM_TOKEN, '0x2dd7c9371965472e5a5fd28fbe165007c61439e1'.toLowerCase()], // curve pool
    [FtmAddresses.BIFI_TOKEN, '0x7fb900c14c9889a559c777d016a885995ce759ee'.toLowerCase()], // BeefyRewardPool
    [FtmAddresses.TUSD_TOKEN, '0xa3abb8bcc6ffea82d3a0a8f800050f684db27db8'.toLowerCase()], // Some strategy
    [FtmAddresses.FBTC_TOKEN, '0x1f45Df42E81892260f50A256bBE7120d6624c2F1'.toLowerCase()], // wallet
    [FtmAddresses.FETH_TOKEN, '0x15a3f675184a4e09877ed10ad8080438ea9e35ae'.toLowerCase()], // wallet
    [MaticAddresses.FXS_TOKEN, '0x1a3acf6d19267e2d3e7f898f42803e90c9219062'.toLowerCase()], // itself
    [MaticAddresses.AM3CRV_TOKEN, '0xA1C4Aac752043258c1971463390013e6082C106f'.toLowerCase()], // wallet
    [FtmAddresses.g3CRV_TOKEN, '0xd4f94d0aaa640bbb72b5eec2d85f6d114d81a88e'.toLowerCase()], // gauge
    [MaticAddresses.USD_BTC_ETH_CRV_TOKEN, '0x5342D9085765baBF184e7bBa98C9CB7528dfDACE'.toLowerCase()], // wallet
    [FtmAddresses.USD_BTC_ETH_CRV_TOKEN, '0x00702bbdead24c40647f235f15971db0867f6bdb'.toLowerCase()], // gauge
    [MaticAddresses.BTCCRV_TOKEN, '0xffbACcE0CC7C19d46132f1258FC16CF6871D153c'.toLowerCase()], // gauge
    [MaticAddresses.IRON_IS3USD, '0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD'.toLowerCase()], // chef
    [MaticAddresses.IRON_IRON_IS3USD, '0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD'.toLowerCase()], // chef
    [FtmAddresses.TETU_TOKEN, '0x1fD1259Fa8CdC60c6E8C86cfA592CA1b8403DFaD'.toLowerCase()], // chef
    [FtmAddresses.DAI_TOKEN, '0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E'.toLowerCase()], // itself
    [MaticAddresses.BAL_TOKEN, '0xBA12222222228d8Ba445958a75a0704d566BF2C8'.toLowerCase()], // balancer
    [MaticAddresses.miMATIC_TOKEN, '0x25864a712C80d33Ba1ad7c23CffA18b46F2fc00c'.toLowerCase()],
    [FtmAddresses.WBTC_TOKEN, '0x38aca5484b8603373acc6961ecd57a6a594510a3'.toLowerCase()], // geist
    [FtmAddresses.WETH_TOKEN, '0x25c130b2624cf12a4ea30143ef50c5d68cefa22f'.toLowerCase()], // geist
    [MaticAddresses.KLIMA_TOKEN, '0x65A5076C0BA74e5f3e069995dc3DAB9D197d995c'.toLowerCase()], // gnosis
    [FtmAddresses._2poolCrv_TOKEN, '0x8866414733F22295b7563f9C5299715D2D76CAf4'.toLowerCase()], // gauge
    [FtmAddresses.renCRV_TOKEN, '0xBdFF0C27dd073C119ebcb1299a68A6A92aE607F0'.toLowerCase()], // gauge
    [MaticAddresses.PSP_TOKEN, '0x2ee05fad3b206a232e985acbda949b215c67f00e'.toLowerCase()], // wallet
    [MaticAddresses.VSQ_TOKEN, '0x2f3e9e54bd4513d1b49a6d915f9a83310638cfc2'.toLowerCase()], // VSQStaking
    [FtmAddresses.FRAX_TOKEN, '0x7a656B342E14F745e2B164890E88017e27AE7320'.toLowerCase()], // curve pool
    [FtmAddresses.SPELL_TOKEN, '0x4f41D03631Ea4dC14016CcF90690d6D22b24C12D'.toLowerCase()], // spirit lp
  ]);

  public static async balanceOf(tokenAddress: string, account: string): Promise<BigNumber> {
    return ERC20__factory.connect(tokenAddress, ethers.provider).balanceOf(account);
  }

  public static async totalSupply(tokenAddress: string): Promise<BigNumber> {
    return ERC20__factory.connect(tokenAddress, ethers.provider).totalSupply();
  }

  public static async approve(tokenAddress: string, signer: SignerWithAddress, spender: string, amount: string) {
    console.log('approve', await TokenUtils.tokenSymbol(tokenAddress), amount);
    return ERC20__factory.connect(tokenAddress, signer).approve(spender, BigNumber.from(amount));
  }

  public static async approveNFT(tokenAddress: string, signer: SignerWithAddress, spender: string, id: string) {
    console.log('approve', await TokenUtils.tokenSymbol(tokenAddress), id);
    await TokenUtils.checkNftBalance(tokenAddress, signer.address, id);
    return ERC20__factory.connect(tokenAddress, signer).approve(spender, id);
  }

  public static async allowance(tokenAddress: string, signer: SignerWithAddress, spender: string): Promise<BigNumber> {
    return ERC20__factory.connect(tokenAddress, signer).allowance(signer.address, spender);
  }

  public static async transfer(tokenAddress: string, signer: SignerWithAddress, destination: string, amount: string) {
    console.log('transfer', await TokenUtils.tokenSymbol(tokenAddress), amount);
    return ERC20__factory.connect(tokenAddress, signer).transfer(destination, BigNumber.from(amount))
  }

  public static async wrapNetworkToken(signer: SignerWithAddress, amount: string) {
    const token = await ethers.getContractAt("IWmatic", await DeployerUtils.getNetworkTokenAddress(), signer) as IWmatic;
    return token.deposit({value: utils.parseUnits(amount, 18).toString()})
  }

  public static async decimals(tokenAddress: string): Promise<number> {
    return ERC20__factory.connect(tokenAddress, ethers.provider).decimals();
  }

  public static async tokenName(tokenAddress: string): Promise<string> {
    return ERC20__factory.connect(tokenAddress, ethers.provider).name();
  }

  public static async tokenSymbol(tokenAddress: string): Promise<string> {
    return ERC20__factory.connect(tokenAddress, ethers.provider).symbol();
  }

  public static async checkBalance(tokenAddress: string, account: string, amount: string) {
    const bal = await TokenUtils.balanceOf(tokenAddress, account);
    expect(bal.gt(BigNumber.from(amount))).is.eq(true, 'Balance less than amount');
    return bal;
  }

  public static async tokenOfOwnerByIndex(tokenAddress: string, account: string, index: number) {
    return IERC721Enumerable__factory.connect(tokenAddress, ethers.provider).tokenOfOwnerByIndex(account, index);
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
