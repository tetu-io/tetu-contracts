const Claim = require("./claim.js");
const {ethers} = require("hardhat");

const accountsEth = [
];

const accountsPoly = [
   // AMB 2.0 BAL Pipes
  "0x4bfe2eAc4c8e07fBfCD0D5A003A78900F8e0B589", // AMB WETH
  "0x62E3A5d0321616B73CCc890a5D894384020B768D", // AMB MATIC
  "0xf5c30eC17BcF3C34FB515EC68009e5da28b5D06F", // AMB AAVE
  "0xA69967d315d7add8222aEe81c1F178dAc0017089", // AMB WBTC
];

const BAL_TOKEN = '0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3';
const TUSD_TOKEN = '0x2e1AD108fF1D8C782fcBbB89AAd783aC49586756';
const QI_TOKEN = '0x580A84C73811E1839F75d86d75d88cCa0c241fF4';
const tokensPoly = [
  BAL_TOKEN,
  // TUSD_TOKEN, // AMB not rewarded with TUSD
  QI_TOKEN,
];

const DENOMINATOR = ethers.BigNumber.from(10).pow(10);
const FIXED_POINTS = 10**8;

const network = 'polygon';
const weeksEth = [73, 74];

const weeksPoly = [];
const firstWeek = 26;
const lastWeek = 28;
for (let i = firstWeek; i <= lastWeek; i++) weeksPoly.push(i);

let accounts;
if (network === 'polygon') {
  accounts = accountsPoly;
  weeks = weeksPoly;
  tokens = tokensPoly;
} else {
  accounts = accountsEth;
  weeks = weeksEth;
  tokens = ['0xba100000625a3754423978a60c9317c58a424e3D'];
}
async function claimBal() {
  console.log("Network:", network);
  let totalRewards = 0;
  let totalClaimed = 0;

  for (j = 0; j < accounts.length; j++) {
    let account = accounts[j];
    console.log("Account:", account, " - ", j+1, "/", accounts.length);

    for (k = 0; k < tokens.length; k++) {
      console.log("Fetching token");
      const token = tokens[k];
      console.log("Token:", token);
      let tokenContract = await ethers.getContractAt("ERC20", token);

      console.log("Fetching pending claims");
      let pendingClaims = {claims: [], reports: []};
      for (l = 0; l < weeks.length; l++) {
        let week = weeks[l];
        if (token === TUSD_TOKEN) {
          week = week - 5;
        } else if (token === QI_TOKEN) {
          week = week - 15;
        }
        if (week < 1) {
          continue;
        }
        console.log('week', week);
        try {
          let pendingClaim = await Claim.getPendingClaims(account, week, network, token);
          if (pendingClaim) {
            pendingClaims.claims.push(pendingClaim.claim);
            pendingClaims.reports[week] = pendingClaim.report[week];
          }
        } catch (e) {
          console.warn('Error getting claims for week', week, 'Error:', e.message, typeof e)
          // week is not published, so break the cycle
          // break;
        }
      }
      console.log("Claims:");
      console.log(pendingClaims.claims);

      if (pendingClaims.claims.length<1) {
        console.log("No pending claims");
        continue;
      }

      let totalAmount = 0;
      for (i = 0; i < pendingClaims.claims.length; i++) {
        totalAmount += Number(pendingClaims.claims[i]['amount']);
      }
      totalRewards += totalAmount;
      console.log("Total amount:", totalAmount);
      console.log("for account :", account);

      if (totalAmount < 50 && network === 'eth') {
        console.log("Total claim amount too small");
        continue;
      }

      console.log("Making claims");
      let balanceBefore = await tokenContract.balanceOf(account);
      console.log('balanceBefore', balanceBefore.toString());
      let claim = await Claim.claimRewards(account, pendingClaims.claims, pendingClaims.reports, network, token);
      console.log("tx:", claim.hash);
      await claim.wait();
      console.log("tx mined");

      let balanceAfter = await tokenContract.balanceOf(account);
      console.log('balanceAfter', balanceAfter.toString());
      const claimed = balanceAfter.sub(balanceBefore).div(DENOMINATOR).toNumber();
      console.log("tx:", claim.hash);
      console.log("+++Claimed:", claimed/FIXED_POINTS);
      console.log("---------------");
      totalClaimed += claimed;
      console.log('totalClaimed', totalClaimed/FIXED_POINTS);
    }
  }
  console.log('totalRewards for all accounts', totalRewards);
  console.log('totalClaimed for all accounts', totalClaimed/FIXED_POINTS);
}

claimBal().then()
// module.exports = {claimBal}
