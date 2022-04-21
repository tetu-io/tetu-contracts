// tslint:disable-next-line:no-var-requires
const Claim = require("./claim.js");

const {ethers, network } = require("hardhat");

const accounts = [
  // // AMB 2.0 BAL Pipes
  // "0x4bfe2eAc4c8e07fBfCD0D5A003A78900F8e0B589", // AMB WETH
  // "0x62E3A5d0321616B73CCc890a5D894384020B768D", // AMB MATIC
  // "0xf5c30eC17BcF3C34FB515EC68009e5da28b5D06F", // AMB AAVE
  // "0xA69967d315d7add8222aEe81c1F178dAc0017089", // AMB WBTC

  // // AMB 1.0 BAL Pipes
  // "0xcacD584EF2815E066C8A507E26D3592a41c7DF4A", // AMB WETH
  // "0xF710277064c49f4689f061B4263d8930E395C61d", // AMB MATIC
  // "0x88f0b9F9B97f8A02508E4E69d46B619fc385c5f4", // AMB AAVE
  // "0x42d68D48120333720FbA4B079f47240b6FdEcef2", // AMB WBTC
];

const tokens = [
  '0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3', // BAL
  // '0x2e1AD108fF1D8C782fcBbB89AAd783aC49586756', // TUSD
  // '0x580A84C73811E1839F75d86d75d88cCa0c241fF4', // QI
];


// const weekFirst = 1;
const weekFirst = 1;
const weekLast = 2; // TODO 27
console.log('weeks from', weekFirst, 'to', weekLast);

console.log('network.name', network.name);
const networkName = ['hardhat','matic'].includes(network.name)
    ? 'polygon' : network.name; // use matic constants for hardhat forking

async function claimBal() {
  console.log("Network:", networkName);
  let totalRewards = 0;
  let totalClaimed = 0;

  for (let j = 0; j < accounts.length; j++) {
    let account = accounts[j];
    console.log("Account:", account, " - ", j+1, "/",accounts.length);

    for (let k = 0; k < tokens.length; k++) {
      console.log("Fetching token");
      const token = tokens[k];
      console.log("Token:", token);
      // const IERC20 = artifacts.require("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20");
      let tokenContract = await ethers.getContractAt("ERC20", token);

      console.log("Fetching pending claims");
      let pendingClaims = {claims: [], reports: []};
      for (let week = weekFirst; week <= weekLast; week++) {
        console.log('week', week);
        try {
          let pendingClaim = await Claim.getPendingClaims(account, week, networkName, token);
          if (pendingClaim) {
            pendingClaims.claims.push(pendingClaim.claim);
            pendingClaims.reports[week] = pendingClaim.report[week];
          }
        } catch (e) {
          console.warn('Error getting claims for week', week, 'Error:', e.message, typeof e)
          // week is not published, so break the cycle
          break;
        }
      }
      console.log("Claims:");
      console.log(pendingClaims.claims);

      if (pendingClaims.claims.length<1) {
        console.log("No pending claims");
        continue;
      }

      let totalAmount = 0;
      for (let i = 0; i < pendingClaims.claims.length; i++) {
        totalAmount += Number(pendingClaims.claims[i]['amount']);
      }
      totalRewards += totalAmount;
      console.log("Total amount:", totalAmount);
      console.log("for account :", account);

      let balanceBefore = await tokenContract.balanceOf(account);
      console.log('network.name', network.name);
      // if (network.name !== 'hardhat') { // TODO remove
        console.log("Making claims");

        let claim = await Claim.claimRewards(account, pendingClaims.claims, pendingClaims.reports, networkName, token);
        console.log("tx:", claim.hash);
        await claim.wait();
        console.log("tx mined");
      // } else console.log('Claim skipped.')

      let balanceAfter = await tokenContract.balanceOf(account);
      const fixed = 8;
      const claimed = (balanceAfter.sub(balanceBefore).div(10**(18-fixed))).toNumber() / 10**fixed;
      console.log("++++ Claimed:", claimed/*.toFixed(fixed)*/);
      totalClaimed += claimed;

    }
  }
  console.log('totalRewards for all accounts', totalRewards);
  console.log('totalClaimed for all accounts', totalClaimed);
}

claimBal().then();
// module.exports = {claimBal}
