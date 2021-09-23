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

import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../governance/Controllable.sol";

contract TetuLoans is ERC721Holder, Controllable, ReentrancyGuard {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;

  enum AssetType {
    ERC20, // 0
    ERC721 // 1
  }

  struct Loan {
    uint256 id;
    address borrower;
    uint256 loanDurationBlocks;
    uint256 loanFee;
    uint256 createdBlock;
    uint256 createdTs;

    address collateralToken;
    AssetType collateralType;
    uint256 collateralAmount;
    uint256 collateralTokenId;

    address acquiredToken;
    address acquiredAmount;

    address lender;
    uint256 loanStartBlock;
    uint256 loanStartTs;

    uint256 listIndex;
    uint256 byCollateralIndex;
    uint256 byAcquiredIndex;
    uint256 borrowerPosIndex;
  }

  uint256 constant public MAX_POSITIONS_PER_USER = 100;
  uint256 constant public LOAN_FEE_DENOMINATOR = 1000;
  uint256 constant public PLATFORM_FEE = 10; // 1%

  mapping(uint256 => Loan) loans;
  Loan[] loansList;
  uint256 loansCounter;
  mapping(address => Loan[]) loansByCollateral;
  mapping(address => Loan[]) loansByAcquired;
  mapping(address => Loan[]) borrowerPositions;

  // ************* USER ACTIONS *************

  function openPosition(
    address _collateralToken,
    uint256 _collateralAmount,
    uint256 _collateralTokenId,
    address _acquiredToken,
    address _acquiredAmount,
    uint256 _loanDurationBlocks,
    uint256 _loanFee
  ) external onlyAllowedUsers nonReentrant {
    require(borrowerPositions[msg.sender].length < MAX_POSITIONS_PER_USER, "TL: Too many positions");

    loans[loansCounter] = Loan(
      loansCounter,
      msg.sender,
      _loanDurationBlocks,
      _loanFee,
      block.number,
      block.timestamp,
      _collateralToken,
      getAssetType(_collateralToken),
      _collateralAmount,
      _collateralTokenId,
      _acquiredToken,
      _acquiredAmount,
      address(0),
      0,
      0,
      loansList.length - 1,
      0,
      0,
      0
    );

    loansList.push(loans[loansCounter]);
    loansByCollateral[_collateralToken].push(loans[loansCounter]);
    loansByAcquired[_acquiredToken].push(loans[loansCounter]);
    borrowerPositions[msg.sender].push(loans[loansCounter]);

    loans[loansCounter].byCollateralIndex = loansByCollateral[_collateralToken].length - 1;
    loans[loansCounter].byAcquiredIndex = loansByAcquired[_acquiredToken].length - 1;
    loans[loansCounter].borrowerPosIndex = borrowerPositions[msg.sender].length - 1;

    loansCounter++;

    transferCollateral(loans[loansCounter], msg.sender, address(this));
  }

  function closePosition(uint256 _loanId) external onlyAllowedUsers nonReentrant {
    Loan memory loan = loans[_loanId];
    require(loan.borrower == msg.sender, "TL: Only borrower can close a position");
    require(loan.lender == address(0), "TL: Can't close executed position");
    removeLoan(loan);

    transferCollateral(loan, address(this), loan.borrower);
  }

  // ************* INTERNAL FUNCTIONS *************

  function transferCollateral(Loan memory _loan, address _sender, address _recipient) internal {
    if (_loan.collateralType == AssetType.ERC20) {
      IERC20(_loan.collateralToken).safeTransfer(_recipient, _loan.collateralAmount);
    } else if (_loan.collateralType == AssetType.ERC721) {
      IERC721(_loan.collateralToken).safeTransferFrom(_sender, _recipient, _loan.collateralTokenId);
    } else {
      revert("TL: Wrong asset type");
    }
  }

  function removeLoan(Loan memory _loan) internal {
    delete loans[_loan.id];

    // shift the last loan and remove
    Loan memory lastLoan = loansList[loansList.length - 1];
    lastLoan.listIndex = _loan.listIndex;
    loansList[_loan.listIndex] = loansList[loansList.length - 1];
    loansList.pop();

    removeFromCollateralLoans(_loan);
    removeFromAcquiredLoans(_loan);
    removeFromBorrowerPositions(_loan);
  }

  function removeFromCollateralLoans(Loan memory _loan) internal {
    Loan[] memory arr = loansByCollateral[_loan.collateralToken];
    Loan memory lastLoan = arr[arr.length - 1];
    lastLoan.byCollateralIndex = _loan.byCollateralIndex;
    arr[_loan.byCollateralIndex] = arr[arr.length - 1];
    loansByCollateral[_loan.collateralToken].pop();
  }

  function removeFromAcquiredLoans(Loan memory _loan) internal {
    Loan[] memory arr = loansByAcquired[_loan.acquiredToken];
    Loan memory lastLoan = arr[arr.length - 1];
    lastLoan.byAcquiredIndex = _loan.byAcquiredIndex;
    arr[_loan.byAcquiredIndex] = arr[arr.length - 1];
    loansByAcquired[_loan.acquiredToken].pop();
  }

  function removeFromBorrowerPositions(Loan memory _loan) internal {
    Loan[] memory arr = borrowerPositions[_loan.borrower];
    Loan memory lastPosition = arr[arr.length - 1];
    lastPosition.borrowerPosIndex = _loan.borrowerPosIndex;
    arr[_loan.borrowerPosIndex] = arr[arr.length - 1];
    borrowerPositions[_loan.borrower].pop();
  }

  function getAssetType(address _token) internal view returns (AssetType){
    if (isERC721(_token)) {
      return AssetType.ERC721;
    } else if (isERC20(_token)) {
      return AssetType.ERC20;
    } else {
      revert("TL: Unknown asset");
    }
  }

  //noinspection NoReturn
  function isERC721(address _token) public view returns (bool) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IERC721(_token).supportsInterface(type(IERC721).interfaceId) returns (bool result){
      return result;
    } catch {
      return false;
    }
  }

  //noinspection NoReturn
  function isERC20(address _token) public view returns (bool) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IERC20(_token).totalSupply() returns (uint256){
      return true;
    } catch {
      return false;
    }
  }
}
