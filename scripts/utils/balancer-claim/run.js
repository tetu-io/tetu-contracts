const Claim = require("./claim.js");
const BigNumber = require("bignumber.js");

const accountsEth = [
  "0x2941A48956A2bD476eac6671d76921B6b7e8C89b",
  "0xc2c30cD4898b6004fbb82a8c7bD72d3b3734b5d1",
	"0x06A2E6347353edd5653B240D70CdC97f37d080ee",
	"0x83DDBb631595cC92Ca34b17e0CFC24e059093FA1",
  "0x857bE610838b6c16B51ffF8bfdd039FA3007C565",
];

const accountsPoly = [
  "0x430799E21A2aF202D8d983E29935e4D2Ed16aa2e",
  "0xB7506271FE72FE2cdC3a7ee6Ead8749AD54df8C2",
	"0xF1499aAe3f8f9cf925b663568A964385898b53c2",
  "0xE4b9a65c8692e7d9c574E99bF7BF2bFFa61F14E9",
  "0xa1A9cb6996a5e33Ef742977435E4ED8738F0e37C",
  "0x014cE9201e417b7A8c49Aa1C9eB72E8f8D2b3DcD",
  "0x58Ca938dcACB193a9939D13A4b2AB6De5128D755",
];

const tokensPoly = [
  '0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3',
  '0x2e1AD108fF1D8C782fcBbB89AAd783aC49586756',
  '0x580A84C73811E1839F75d86d75d88cCa0c241fF4',
];

const network = 'eth';
const weeksEth = [73, 74];
const weeksPoly = [22, 23];

let accounts;
if (network == 'polygon') {
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

  for (j = 0; j < accounts.length; j++) {
    let account = accounts[j];
    console.log("Account:", account, " - ", j+1, "/",accounts.length);

    for (k = 0; k < tokens.length; k++) {
      console.log("Fetching token");
      const token = tokens[k];
      console.log("Token:", token);
      const IERC20 = artifacts.require("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20");
      let tokenContract = await IERC20.at(token);

      console.log("Fetching pending claims");
      let pendingClaims = {claims: [], reports: []};
      for (l = 0; l < weeks.length; l++) {
        let week = weeks[l];
        if (token == '0x2e1AD108fF1D8C782fcBbB89AAd783aC49586756') {
          week = week - 5;
        } else if (token == '0x580A84C73811E1839F75d86d75d88cCa0c241fF4') {
          week = week - 15;
        }
        if (week < 1) {
          continue;
        }
        let pendingClaim = await Claim.getPendingClaims(account, week, network, token);
        if (pendingClaim) {
          pendingClaims.claims.push(pendingClaim.claim);
          pendingClaims.reports[week] = pendingClaim.report[week];
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
      console.log("Total amount:", totalAmount);

      if (totalAmount < 50 && network == 'eth') {
        console.log("Total claim amount too small");
        continue;
      }

      console.log("Making claims");
      let balanceBefore = await tokenContract.balanceOf(account);
      let balanceBeforePretty = new BigNumber(balanceBefore).div(new BigNumber(Math.pow(10, 18)));
      let claim = await Claim.claimRewards(account, pendingClaims.claims, pendingClaims.reports, network, token);
      let balanceAfter = await tokenContract.balanceOf(account);
      let balanceAfterPretty = new BigNumber(balanceAfter).div(new BigNumber(Math.pow(10, 18)));
      console.log("tx:", claim.hash);
      console.log("Claimed:", balanceAfterPretty.toFixed() - balanceBeforePretty.toFixed());
    }
  }
}

module.exports = {claimBal}
