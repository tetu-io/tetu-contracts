const gateway = process.env.VUE_APP_IPFS_NODE || 'ipfs.io';
const fetch = require("node-fetch");
const BigNumber = require("bignumber.js");
const { MerkleTree, loadTree } = require("./merkle.js");
const { keccak256, keccakFromString, bufferToHex } = require('ethereumjs-util');
const { hexToBytes, toWei, soliditySha3 } = require('web3-utils');
const { type2Transaction } = require('./utils.js');
const {ethers} = require("hardhat");

// type Snapshot = Record<number, string>;

const constants = {
  merkleOrchardEth: '0xdAE7e32ADc5d490a43cCba1f0c736033F2b4eFca',
  merkleOrchardPoly: '0x0F3e0c4218b7b0108a3643cFe9D3ec0d4F57c54e',
  snapshotBalEth: 'https://raw.githubusercontent.com/balancer-labs/bal-mining-scripts/master/reports/_current.json',
  snapshotBalPoly: 'https://raw.githubusercontent.com/balancer-labs/bal-mining-scripts/master/reports/_current-polygon.json',
  snapshotTusdPoly: 'https://raw.githubusercontent.com/balancer-labs/bal-mining-scripts/master/reports/_current-tusd-polygon.json',
  snapshotQiPoly: 'https://raw.githubusercontent.com/balancer-labs/bal-mining-scripts/master/reports/_current-qi-polygon.json',
  distributorBal: '0xd2EB7Bd802A7CA68d9AcD209bEc4E664A9abDD7b',
  distributorTusdPoly: '0xc38c5f97B34E175FFd35407fc91a937300E33860',
  distributorQiPoly: '0xc38c5f97B34E175FFd35407fc91a937300E33860'
};

async function ipfsGet(
  gateway,
  ipfsHash,
  protocolType = 'ipfs'
) {
  const url = `https://${gateway}/${protocolType}/${ipfsHash}`;
  const result = await fetch(url).then(res => res.json());
  return result
}

async function getSnapshot(network, token) {
  let snapshot
  if (network == 'polygon') {
    if (token == '0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3'){
      snapshot = constants.snapshotBalPoly
    } else if (token == '0x2e1AD108fF1D8C782fcBbB89AAd783aC49586756') {
      snapshot = constants.snapshotTusdPoly
    } else if (token == '0x580A84C73811E1839F75d86d75d88cCa0c241fF4') {
      snapshot = constants.snapshotQiPoly
    }
  } else {
    snapshot = constants.snapshotBalEth
  }
  if (snapshot) {
    return (await fetch(snapshot).then(res => res.json())) || {};
  }
  return {};
}

async function getClaimStatus(
  account,
  week,
  network,
  token,
  distributor
) {
  let merkleAddress;
  if (network == 'polygon') {
    merkleAddress = constants.merkleOrchardPoly;
  } else {
    merkleAddress = constants.merkleOrchardEth;
  }
  const merkleContract = await ethers.getContractAt("IMerkleOrchard", merkleAddress);
  return await merkleContract.isClaimed(token, distributor, week, account);
}

async function getReports(snapshot, week) {
  const reports = [await ipfsGet(gateway, snapshot[week])];
  return Object.fromEntries(reports.map((report, i) => [week, report]));
}

async function getPendingClaims(
  account,
  week,
  network,
  token
) {
  const snapshot = await getSnapshot(network, token);

  let distributor;
  if (network == 'polygon') {
    if (token == '0x9a71012B13CA4d3D0Cdc72A177DF3ef03b0E76A3'){
      distributor = constants.distributorBal;
    } else if (token == '0x2e1AD108fF1D8C782fcBbB89AAd783aC49586756') {
      distributor = constants.distributorTusdPoly;
    } else if (token == '0x580A84C73811E1839F75d86d75d88cCa0c241fF4') {
      distributor = constants.distributorQiPoly
    }
  } else {
    distributor = constants.distributorBal;
  }

  const claimStatus = await getClaimStatus(
    account,
    week,
    network,
    token,
    distributor
  );
  if (claimStatus) {
    return 0;
  }

  const report = await getReports(snapshot, week);

  if (!report[week][account]){
    return 0;
  }

  return {
    claim: {
          id: week,
          amount: report[week][account],
          amountDenorm: toWei(report[week][account]),
          distributor: distributor
        },
    report: report
  };
}

async function claimRewards(
  account,
  pendingClaims,
  reports,
  network,
  token
) {
  try {
    const claims = pendingClaims.map(week => {
      const claimBalance = week.amount;
      const merkleTree = loadTree(reports[week.id]);
      const distributor = week.distributor;

      const proof = merkleTree.getHexProof(
        soliditySha3(account, toWei(claimBalance))
      );
      return [parseInt(week.id), toWei(claimBalance), distributor, 0, proof];
    });

    let merkleAddress, balToken, priorityFee;
    if (network == 'polygon') {
      merkleAddress = constants.merkleOrchardPoly;
    } else {
      merkleAddress = constants.merkleOrchardEth;
    }
    const merkleContract = await ethers.getContractAt("IMerkleOrchard", merkleAddress);
    const result = await merkleContract.claimDistributions(account, claims, [token]);
    return result;
  } catch (e) {
    console.log('[Claim] Claim Rewards Error:', e);
    return Promise.reject(e);
  }
}

module.exports = {
  constants,
  ipfsGet,
  getSnapshot,
  getReports,
  getClaimStatus,
  getPendingClaims,
  claimRewards
}
