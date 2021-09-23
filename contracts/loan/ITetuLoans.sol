// SPDX-License-Identifier: ISC
/**
* By using this software, you understand, acknowledge and accept that Tetu
* and/or the underlying software are provided “as is” and “as available”
* basis and without warranties or representations of any kind either expressed
* or implied. Any use of this open source software released under the ISC
* Internet Systems Consortium license is done at your own risk to the fullest
* extent permissible pursuant to applicable law any and all liability as well
* as all warranties, including any fitness for a particular purpose with respect
* to Tetu and/or the underlying software and the use thereof are disclaimed.
*/

pragma solidity 0.8.4;

interface ITetuLoans {

  enum AssetType {
    ERC20, // 0
    ERC721 // 1
  }

  enum IndexType {
    LIST, // 0
    BY_COLLATERAL, // 1
    BY_ACQUIRED, // 2
    BORROWER_POSITION, // 3
    LENDER_POSITION, // 4
    LOAN_TO_BID // 5
  }

  struct Loan {
    uint256 id;
    address borrower;
    LoanInfo info;
    LoanCollateral collateral;
    LoanAcquired acquired;
    LoanExecution execution;
    //    LoanIndex index;
  }

  struct LoanInfo {
    uint256 loanDurationBlocks;
    uint256 loanFee;
    uint256 createdBlock;
    uint256 createdTs;
  }

  struct LoanCollateral {
    address collateralToken;
    AssetType collateralType;
    uint256 collateralAmount;
    uint256 collateralTokenId;
  }

  struct LoanAcquired {
    address acquiredToken;
    uint256 acquiredAmount;
  }

  struct LoanExecution {
    address lender;
    uint256 loanStartBlock;
    uint256 loanStartTs;
    uint256 loanEndTs;
  }

  struct AuctionBid {
    uint256 id;
    uint256 loanId;
    address lender;
    uint256 amount;
  }

}
