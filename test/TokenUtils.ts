import {ethers} from "hardhat";
import {ERC20, ERC721, IERC20, IERC721Enumerable, IWmatic} from "../typechain";
import {BigNumber, utils} from "ethers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {MaticAddresses} from "./MaticAddresses";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";

const {expect} = chai;
chai.use(chaiAsPromised);

export class TokenUtils {

  public static async balanceOf(tokenAddress: string, account: string): Promise<BigNumber> {
    const token = await ethers.getContractAt("IERC20", tokenAddress) as IERC20;
    return await token.balanceOf(account);
  }

  public static async totalSupply(tokenAddress: string): Promise<BigNumber> {
    const token = await ethers.getContractAt("IERC20", tokenAddress) as IERC20;
    return await token.totalSupply();
  }

  public static async approve(tokenAddress: string, signer: SignerWithAddress, spender: string, amount: string) {
    console.log('approve', await TokenUtils.tokenSymbol(tokenAddress), amount);
    // await TokenUtils.checkBalance(tokenAddress, signer.address, amount);
    const token = await ethers.getContractAt("IERC20", tokenAddress, signer) as IERC20;
    return await token.approve(spender, BigNumber.from(amount));
  }

  public static async approveNFT(tokenAddress: string, signer: SignerWithAddress, spender: string, id: string) {
    console.log('approve', await TokenUtils.tokenSymbol(tokenAddress), id);
    await TokenUtils.checkNftBalance(tokenAddress, signer.address, id);
    const token = await ethers.getContractAt("ERC721", tokenAddress, signer) as ERC721;
    return await token.approve(spender, id);
  }

  public static async allowance(tokenAddress: string, signer: SignerWithAddress, spender: string): Promise<BigNumber> {
    const token = await ethers.getContractAt("IERC20", tokenAddress, signer) as IERC20;
    return await token.allowance(signer.address, spender);
  }

  public static async transfer(tokenAddress: string, signer: SignerWithAddress, destination: string, amount: string) {
    console.log('transfer', await TokenUtils.tokenSymbol(tokenAddress), amount);
    const token = await ethers.getContractAt("IERC20", tokenAddress, signer) as IERC20;
    return await token.transfer(destination, BigNumber.from(amount))
  }

  public static async wrapMatic(signer: SignerWithAddress, amount: string) {
    const token = await ethers.getContractAt("IWmatic", MaticAddresses.WMATIC_TOKEN, signer) as IWmatic;
    return await token.deposit({value: utils.parseUnits(amount, 18).toString()})
  }

  public static async decimals(tokenAddress: string): Promise<number> {
    const token = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;
    return await token.decimals();
  }

  public static async tokenName(tokenAddress: string): Promise<string> {
    const token = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;
    return await token.name();
  }

  public static async tokenSymbol(tokenAddress: string): Promise<string> {
    const token = await ethers.getContractAt("ERC20", tokenAddress) as ERC20;
    return await token.symbol();
  }

  public static async checkBalance(tokenAddress: string, account: string, amount: string) {
    const bal = await TokenUtils.balanceOf(tokenAddress, account);
    expect(bal.gt(BigNumber.from(amount))).is.true;
    return bal;
  }

  public static async tokenOfOwnerByIndex(tokenAddress: string, account: string, index: number) {
    const token = await ethers.getContractAt("IERC721Enumerable", tokenAddress) as IERC721Enumerable;
    return await token.tokenOfOwnerByIndex(account, index);
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
    expect(found).is.true;
    return tokenId;
  }

}
