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

/// @title Interface for Tetu PawnShop contract
/// @author belbix
interface ITetuPawnShop {

  event PositionOpened(
    address indexed sender,
    uint256 posId,
    address collateralToken,
    uint256 collateralAmount,
    uint256 collateralTokenId,
    address acquiredToken,
    uint256 acquiredAmount,
    uint256 posDurationBlocks,
    uint256 posFee
  );
  event PositionClosed(address indexed borrower, uint256 posId);
  event BidExecuted(
    uint256 posId,
    uint256 bidId,
    uint256 amount,
    address acquiredMoneyHolder,
    address lender
  );
  event AuctionBidOpened(uint256 posId, uint256 bidId, uint256 amount, address lender);
  event PositionClaimed(address indexed sender, uint256 posId);
  event PositionRedeemed(address indexed sender, uint256 posId);
  event AuctionBidAccepted(address indexed borrower, uint256 posId, uint256 bidId);
  event AuctionBidClosed(uint256 posId, uint256 bidId);

  event GovernanceActionAnnounced(uint256 id, address addressValue, uint256 uintValue);
  event OwnerChanged(address oldOwner, address newOwner);
  event FeeRecipientChanged(address oldRecipient, address newRecipient);
  event PlatformFeeChanged(uint256 oldFee, uint256 newFee);
  event DepositAmountChanged(uint256 oldAmount, uint256 newAmount);
  event DepositTokenChanged(address oldToken, address newToken);

  enum GovernanceAction {
    ChangeOwner, // 0
    ChangeFeeRecipient, // 1
    ChangePlatformFee, // 2
    ChangePositionDepositAmount, // 3
    ChangePositionDepositToken // 4
  }

  enum AssetType {
    ERC20, // 0
    ERC721 // 1
  }

  enum IndexType {
    LIST, // 0
    BY_COLLATERAL, // 1
    BY_ACQUIRED, // 2
    BORROWER_POSITION, // 3
    LENDER_POSITION // 4
  }

  struct TimeLock {
    uint256 time;
    address addressValue;
    uint256 uintValue;
  }

  struct Position {
    uint256 id;
    address borrower;
    address depositToken;
    uint256 depositAmount;
    bool open;
    uint minAuctionAmount;
    PositionInfo info;
    PositionCollateral collateral;
    PositionAcquired acquired;
    PositionExecution execution;
  }

  struct PositionInfo {
    uint256 posDurationBlocks;
    uint256 posFee;
    uint256 createdBlock;
    uint256 createdTs;
  }

  struct PositionCollateral {
    address collateralToken;
    AssetType collateralType;
    uint256 collateralAmount;
    uint256 collateralTokenId;
  }

  struct PositionAcquired {
    address acquiredToken;
    uint256 acquiredAmount;
  }

  struct PositionExecution {
    address lender;
    uint256 posStartBlock;
    uint256 posStartTs;
    uint256 posEndTs;
  }

  struct AuctionBid {
    uint256 id;
    uint256 posId;
    address lender;
    uint256 amount;
    bool open;
  }

  // ****************** VIEWS ****************************

  /// @dev PosId counter. Should start from 1 for keep 0 as empty value
  function positionCounter() external view returns (uint256);

  /// @notice Return Position for given id
  /// @dev AbiEncoder not able to auto generate functions for mapping with structs
  function getPosition(uint256 posId) external view returns (Position memory);

  /// @dev Hold open positions ids. Removed when position closed
  function openPositions(uint256 index) external view returns (uint256 posId);

  /// @dev Collateral token => PosIds
  function positionsByCollateral(address collateralToken, uint256 index) external view returns (uint256 posId);

  /// @dev Acquired token => PosIds
  function positionsByAcquired(address acquiredToken, uint256 index) external view returns (uint256 posId);

  /// @dev Borrower token => PosIds
  function borrowerPositions(address borrower, uint256 index) external view returns (uint256 posId);

  /// @dev Lender token => PosIds
  function lenderPositions(address lender, uint256 index) external view returns (uint256 posId);

  /// @dev index type => PosId => index
  ///      Hold array positions for given type of array
  function posIndexes(IndexType typeId, uint256 posId) external view returns (uint256 index);

  /// @dev BidId counter. Should start from 1 for keep 0 as empty value
  function auctionBidCounter() external view returns (uint256);

  /// @notice Return auction bid for given id
  /// @dev AbiEncoder not able to auto generate functions for mapping with structs
  function getAuctionBid(uint256 bidId) external view returns (AuctionBid memory);

  /// @dev lender => PosId => positionToBidIds + 1
  ///      Lender auction position for given PosId. 0 keep for empty position
  function lenderOpenBids(address lender, uint256 posId) external view returns (uint256 index);

  /// @dev PosId => bidIds. All open and close bids for the given position
  function positionToBidIds(uint256 posId, uint256 index) external view returns (uint256 bidId);

  /// @dev PosId => timestamp. Timestamp of the last bid for the auction
  function lastAuctionBidTs(uint256 posId) external view returns (uint256 ts);

  /// @dev Return amount required for redeem position
  function toRedeem(uint256 posId) external view returns (uint256 amount);

  /// @dev Return asset type ERC20 or ERC721
  function getAssetType(address _token) external view returns (AssetType);

  function isERC721(address _token) external view returns (bool);

  function isERC20(address _token) external view returns (bool);

  /// @dev Return size of active positions
  function openPositionsSize() external view returns (uint256);

  /// @dev Return size of all auction bids for given position
  function auctionBidSize(uint256 posId) external view returns (uint256);

  function positionsByCollateralSize(address collateral) external view returns (uint256);

  function positionsByAcquiredSize(address acquiredToken) external view returns (uint256);

  function borrowerPositionsSize(address borrower) external view returns (uint256);

  function lenderPositionsSize(address lender) external view returns (uint256);

  // ************* USER ACTIONS *************

  /// @dev Borrower action. Assume approve
  ///      Allows the user to create a new borrowing position by depositing their collateral tokens.
  function openPosition(
    address _collateralToken,
    uint256 _collateralAmount,
    uint256 _collateralTokenId,
    address _acquiredToken,
    uint256 _acquiredAmount,
    uint256 _posDurationBlocks,
    uint256 _posFee,
    uint minAuctionPrice
  ) external returns (uint256);

  /// @dev Borrower action
  ///      Close not executed position. Return collateral and deposit to borrower
  function closePosition(uint256 id) external;

  /// @dev Lender action. Assume approve for acquired token
  ///      Place a bid for given position ID
  ///      It can be an auction bid if acquired amount is zero
  function bid(uint256 id, uint256 amount) external;

  /// @dev Lender action
  ///      Transfer collateral to lender if borrower didn't return the loan
  ///      Deposit will be returned to borrower
  function claim(uint256 id) external;

  /// @dev Borrower action. Assume approve on acquired token
  ///      Return the loan to lender, transfer collateral and deposit to borrower
  function redeem(uint256 id) external;

  /// @dev Borrower action. Assume that auction ended.
  ///      Transfer acquired token to borrower
  function acceptAuctionBid(uint256 posId) external;

  /// @dev Lender action. Requires ended auction, or not the last bid
  ///      Close auction bid and transfer acquired tokens to lender
  function closeAuctionBid(uint256 bidId) external;

  /// @dev Announce governance action
  function announceGovernanceAction(GovernanceAction id, address addressValue, uint256 uintValue) external;

  /// @dev Set new contract owner
  function setOwner(address _newOwner) external;

  /// @dev Set new fee recipient
  function setFeeRecipient(address _newFeeRecipient) external;

  /// @dev Platform fee in range 0 - 500, with denominator 10000
  function setPlatformFee(uint256 _value) external;

  /// @dev Tokens amount that need to deposit for a new position
  ///      Will be returned when position closed
  function setPositionDepositAmount(uint256 _value) external;

  /// @dev Tokens that need to deposit for a new position
  function setPositionDepositToken(address _value) external;
}
