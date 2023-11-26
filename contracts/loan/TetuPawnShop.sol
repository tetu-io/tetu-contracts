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

// use copies of openzeppelin contracts with changed names for avoid dependency issues
import "../openzeppelin/ERC721Holder.sol";
import "../openzeppelin/IERC721.sol";
import "../openzeppelin/SafeERC20.sol";
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/ReentrancyGuard.sol";
import "../base/ArrayLib.sol";
import "./ITetuPawnShop.sol";
import "./ERC2771Context.sol";

interface IDelegation {
  function clearDelegate(bytes32 _id) external;
  function setDelegate(bytes32 _id, address _delegate) external;
}

/// @title TetuPawnShop contract provides a useful and flexible solution for borrowing
///        and lending assets with a unique feature of supporting both ERC721 and ERC20 tokens as collateral.
///        The contract's modular design allows for easy customization of fees, waiting periods,
///        and other parameters, providing a solid foundation for a decentralized borrowing and lending platform.
/// @author belbix
contract TetuPawnShop is ERC721Holder, ReentrancyGuard, ITetuPawnShop, ERC2771Context {
  using SafeERC20 for IERC20;
  using ArrayLib for uint[];

  // ---- CONSTANTS

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.0.7";
  /// @dev Time lock for any governance actions
  uint constant public TIME_LOCK = 2 days;
  /// @dev Denominator for any internal computation with low precision
  uint constant public DENOMINATOR = 10000;
  /// @dev Governance can't set fee more than this value
  uint constant public PLATFORM_FEE_MAX = 500; // 5%
  /// @dev Standard auction duration that refresh when a new bid placed
  uint constant public AUCTION_DURATION = 1 days;
  /// @dev Timestamp date when contract created
  uint public immutable createdTs;
  /// @dev Block number when contract created
  uint public immutable createdBlock;

  // ---- CHANGEABLE VARIABLES

  /// @dev Contract owner. Should be a multi-signature wallet
  ///      On Polygon TETU msig gov wallet 3/4 is 0xcc16d636dD05b52FF1D8B9CE09B09BC62b11412B
  address public owner;
  /// @dev Fee recipient. Assume it will be a place with ability to manage different tokens
  address public feeRecipient;
  /// @dev 1% by default, percent of acquired tokens that will be used for buybacks
  uint public platformFee = 100;
  /// @dev Amount of tokens for open position. Protection against spam
  uint public positionDepositAmount;
  /// @dev Token for antispam protection. TETU assumed
  ///      Zero address means no protection
  address public positionDepositToken;
  /// @dev Time-locks for governance actions
  mapping(GovernanceAction => TimeLock) public timeLocks;

  // ---- POSITIONS

  /// @inheritdoc ITetuPawnShop
  uint public override positionCounter = 1;
  /// @dev PosId => Position. Hold all positions. Any record should not be removed
  mapping(uint => Position) public positions;
  /// @inheritdoc ITetuPawnShop
  uint[] public override openPositions;
  /// @inheritdoc ITetuPawnShop
  mapping(address => uint[]) public override positionsByCollateral;
  /// @inheritdoc ITetuPawnShop
  mapping(address => uint[]) public override positionsByAcquired;
  /// @inheritdoc ITetuPawnShop
  mapping(address => uint[]) public override borrowerPositions;
  /// @inheritdoc ITetuPawnShop
  mapping(address => uint[]) public override lenderPositions;
  /// @inheritdoc ITetuPawnShop
  mapping(IndexType => mapping(uint => uint)) public override posIndexes;

  // ---- AUCTION

  /// @inheritdoc ITetuPawnShop
  uint public override auctionBidCounter = 1;
  /// @dev BidId => Bid. Hold all bids. Any record should not be removed
  mapping(uint => AuctionBid) public auctionBids;
  /// @inheritdoc ITetuPawnShop
  mapping(address => mapping(uint => uint)) public override lenderOpenBids;
  /// @inheritdoc ITetuPawnShop
  mapping(uint => uint[]) public override positionToBidIds;
  /// @inheritdoc ITetuPawnShop
  mapping(uint => uint) public override lastAuctionBidTs;

  /// @dev Tetu Controller address requires for governance actions
  constructor(
    address _owner,
    address _depositToken,
    uint _positionDepositAmount,
    address _feeRecipient
  ) {
    require(_owner != address(0), "TPS: Zero owner");
    require(_feeRecipient != address(0), "TPS: Zero feeRecipient");
    owner = _owner;
    feeRecipient = _feeRecipient;
    positionDepositToken = _depositToken;
    createdTs = block.timestamp;
    createdBlock = block.number;
    positionDepositAmount = _positionDepositAmount;
  }

  modifier onlyOwner() {
    require(_msgSender() == owner, "TPS: Not owner");
    _;
  }

  /// @dev Check time lock for governance actions and revert if conditions wrong
  modifier checkTimeLock(GovernanceAction action, address _address, uint _uint){
    TimeLock memory timeLock = timeLocks[action];
    require(timeLock.time != 0 && timeLock.time < block.timestamp, "TPS: Time Lock");
    if (_address != address(0)) {
      require(timeLock.addressValue == _address, "TPS: Wrong address value");
    }
    if (_uint != 0) {
      require(timeLock.uintValue == _uint, "TPS: Wrong uint value");
    }
    _;
    delete timeLocks[action];
  }

  // ************* USER ACTIONS *************

  /// @inheritdoc ITetuPawnShop
  function openPosition(
    address _collateralToken,
    uint _collateralAmount,
    uint _collateralTokenId,
    address _acquiredToken,
    uint _acquiredAmount,
    uint _posDurationBlocks,
    uint _posFee,
    uint minAuctionAmount
  ) external nonReentrant override returns (uint){
    require(_posFee <= DENOMINATOR * 10, "TPS: Pos fee absurdly high");
    require(_posDurationBlocks != 0 || _posFee == 0, "TPS: Fee for instant deal forbidden");
    require(_collateralAmount != 0 || _collateralTokenId != 0, "TPS: Wrong amounts");
    require(_collateralToken != address(0), "TPS: Zero cToken");
    require(_acquiredToken != address(0), "TPS: Zero aToken");

    AssetType assetType = _getAssetType(_collateralToken);
    require((assetType == AssetType.ERC20 && _collateralAmount != 0 && _collateralTokenId == 0)
    || (assetType == AssetType.ERC721 && _collateralAmount == 0 && _collateralTokenId != 0), "TPS: Incorrect");

    Position memory pos;
    {
      PositionInfo memory info = PositionInfo(
        _posDurationBlocks,
        _posFee,
        block.number,
        block.timestamp
      );

      PositionCollateral memory collateral = PositionCollateral(
        _collateralToken,
        assetType,
        _collateralAmount,
        _collateralTokenId
      );

      PositionAcquired memory acquired = PositionAcquired(
        _acquiredToken,
        _acquiredAmount
      );

      PositionExecution memory execution = PositionExecution(
        address(0),
        0,
        0,
        0
      );

      pos = Position(
        positionCounter, // id
        _msgSender(), // borrower
        positionDepositToken,
        positionDepositAmount,
        true, // open
        minAuctionAmount,
        info,
        collateral,
        acquired,
        execution
      );
    }

    openPositions.push(pos.id);
    posIndexes[IndexType.LIST][pos.id] = openPositions.length - 1;

    positionsByCollateral[_collateralToken].push(pos.id);
    posIndexes[IndexType.BY_COLLATERAL][pos.id] = positionsByCollateral[_collateralToken].length - 1;

    positionsByAcquired[_acquiredToken].push(pos.id);
    posIndexes[IndexType.BY_ACQUIRED][pos.id] = positionsByAcquired[_acquiredToken].length - 1;

    borrowerPositions[_msgSender()].push(pos.id);
    posIndexes[IndexType.BORROWER_POSITION][pos.id] = borrowerPositions[_msgSender()].length - 1;

    positions[pos.id] = pos;
    positionCounter++;

    _takeDeposit(pos.id);
    _transferCollateral(pos.collateral, _msgSender(), address(this));
    emit PositionOpened(
      _msgSender(),
      pos.id,
      _collateralToken,
      _collateralAmount,
      _collateralTokenId,
      _acquiredToken,
      _acquiredAmount,
      _posDurationBlocks,
      _posFee
    );
    return pos.id;
  }

  /// @inheritdoc ITetuPawnShop
  function closePosition(uint id) external nonReentrant override {
    Position storage pos = positions[id];
    require(pos.id == id, "TPS: Wrong ID");
    require(pos.borrower == _msgSender(), "TPS: Only borrower can close a position");
    require(pos.execution.lender == address(0), "TPS: Can't close executed position");
    require(pos.open, "TPS: Position closed");

    _removePosFromIndexes(pos);
    borrowerPositions[pos.borrower].removeIndexed(posIndexes[IndexType.BORROWER_POSITION], pos.id);

    _transferCollateral(pos.collateral, address(this), pos.borrower);
    _returnDeposit(id);
    pos.open = false;
    emit PositionClosed(_msgSender(), id);
  }

  /// @inheritdoc ITetuPawnShop
  function bid(uint id, uint amount) external nonReentrant override {
    Position storage pos = positions[id];
    require(pos.id == id, "TPS: Wrong ID");
    require(pos.open, "TPS: Position closed");
    require(pos.execution.lender == address(0), "TPS: Can't bid executed position");
    if (pos.acquired.acquiredAmount != 0) {
      require(amount == pos.acquired.acquiredAmount, "TPS: Wrong bid amount");
      _executeBid(pos, 0, amount, _msgSender(), _msgSender());
    } else {
      _auctionBid(pos, amount, _msgSender());
    }
  }

  /// @inheritdoc ITetuPawnShop
  function claim(uint id) external nonReentrant override {
    Position storage pos = positions[id];
    require(pos.id == id, "TPS: Wrong ID");
    require(pos.execution.lender == _msgSender(), "TPS: Only lender can claim");
    uint posEnd = pos.execution.posStartBlock + pos.info.posDurationBlocks;
    require(posEnd < block.number, "TPS: Too early to claim");
    require(pos.open, "TPS: Position closed");

    _endPosition(pos);
    _transferCollateral(pos.collateral, address(this), _msgSender());
    _returnDeposit(id);
    emit PositionClaimed(_msgSender(), id);
  }

  /// @inheritdoc ITetuPawnShop
  function redeem(uint id) external nonReentrant override {
    Position storage pos = positions[id];
    require(pos.id == id, "TPS: Wrong ID");
    require(pos.borrower == _msgSender(), "TPS: Only borrower can redeem");
    require(pos.execution.lender != address(0), "TPS: Not executed position");
    require(pos.open, "TPS: Position closed");

    _endPosition(pos);
    uint toSend = _toRedeem(id);
    IERC20(pos.acquired.acquiredToken).safeTransferFrom(_msgSender(), pos.execution.lender, toSend);
    _transferCollateral(pos.collateral, address(this), _msgSender());
    _returnDeposit(id);
    emit PositionRedeemed(_msgSender(), id);
  }

  /// @inheritdoc ITetuPawnShop
  function acceptAuctionBid(uint posId) external nonReentrant override {
    require(lastAuctionBidTs[posId] + AUCTION_DURATION < block.timestamp, "TPS: Auction not ended");
    require(positionToBidIds[posId].length > 0, "TPS: No bids");
    uint bidId = positionToBidIds[posId][positionToBidIds[posId].length - 1];

    AuctionBid storage _bid = auctionBids[bidId];
    require(_bid.id != 0, "TPS: Auction bid not found");
    require(_bid.open, "TPS: Bid closed");
    require(_bid.posId == posId, "TPS: Wrong bid");

    Position storage pos = positions[posId];
    require(pos.borrower == _msgSender(), "TPS: Not borrower");
    require(pos.open, "TPS: Position closed");

    pos.acquired.acquiredAmount = _bid.amount;
    _executeBid(pos, bidId, _bid.amount, address(this), _bid.lender);
    lenderOpenBids[_bid.lender][pos.id] = 0;
    _bid.open = false;
    emit AuctionBidAccepted(_msgSender(), posId, _bid.id);
  }

  /// @inheritdoc ITetuPawnShop
  function closeAuctionBid(uint bidId) external nonReentrant override {
    AuctionBid storage _bid = auctionBids[bidId];
    require(_bid.id != 0, "TPS: Auction bid not found");
    Position storage pos = positions[_bid.posId];

    uint _lastAuctionBidTs = lastAuctionBidTs[pos.id];
    bool isAuctionEnded = _lastAuctionBidTs + AUCTION_DURATION < block.timestamp;
    // in case if auction is not accepted during 2 weeks lender can close the bid
    bool isAuctionOverdue = _lastAuctionBidTs + AUCTION_DURATION + 2 weeks < block.timestamp;
    bool isLastBid = false;
    if (positionToBidIds[pos.id].length != 0) {
      uint lastBidId = positionToBidIds[pos.id][positionToBidIds[pos.id].length - 1];
      isLastBid = lastBidId == bidId;
    }
    require((isLastBid && isAuctionEnded) || !isLastBid || !pos.open || isAuctionOverdue, "TPS: Auction is not ended");

    address lender = _bid.lender;
    lenderOpenBids[lender][pos.id] = 0;
    _bid.open = false;
    IERC20(pos.acquired.acquiredToken).safeTransfer(lender, _bid.amount);
    emit AuctionBidClosed(pos.id, bidId);
  }

  // ************* INTERNAL FUNCTIONS *************

  /// @dev Transfer to this contract a deposit
  function _takeDeposit(uint posId) internal {
    Position storage pos = positions[posId];
    if (pos.depositToken != address(0)) {
      IERC20(pos.depositToken).safeTransferFrom(pos.borrower, address(this), pos.depositAmount);
    }
  }

  /// @dev Return to borrower a deposit
  function _returnDeposit(uint posId) internal {
    Position storage pos = positions[posId];
    if (pos.depositToken != address(0)) {
      IERC20(pos.depositToken).safeTransfer(pos.borrower, pos.depositAmount);
    }
  }

  /// @dev Execute bid for the open position
  ///      Transfer acquired tokens to borrower
  ///      In case of instant deal transfer collateral to lender
  function _executeBid(
    Position storage pos,
    uint bidId,
    uint amount,
    address acquiredMoneyHolder,
    address lender
  ) internal {
    uint feeAmount = amount * platformFee / DENOMINATOR;
    uint toSend = amount - feeAmount;
    if (acquiredMoneyHolder == address(this)) {
      IERC20(pos.acquired.acquiredToken).safeTransfer(pos.borrower, toSend);
    } else {
      IERC20(pos.acquired.acquiredToken).safeTransferFrom(acquiredMoneyHolder, pos.borrower, toSend);
      IERC20(pos.acquired.acquiredToken).safeTransferFrom(acquiredMoneyHolder, address(this), feeAmount);
    }
    _transferFee(pos.acquired.acquiredToken, feeAmount);

    pos.execution.lender = lender;
    pos.execution.posStartBlock = block.number;
    pos.execution.posStartTs = block.timestamp;
    _removePosFromIndexes(pos);

    lenderPositions[lender].push(pos.id);
    posIndexes[IndexType.LENDER_POSITION][pos.id] = lenderPositions[lender].length - 1;

    // instant buy
    if (pos.info.posDurationBlocks == 0) {
      _transferCollateral(pos.collateral, address(this), lender);
      _endPosition(pos);
    }
    emit BidExecuted(
      pos.id,
      bidId,
      amount,
      acquiredMoneyHolder,
      lender
    );
  }

  /// @dev Open an auction bid
  ///      Transfer acquired token to this contract
  function _auctionBid(Position storage pos, uint amount, address lender) internal {
    require(lenderOpenBids[lender][pos.id] == 0, "TPS: Auction bid already exist");
    require(amount >= pos.minAuctionAmount, "TPS: Too low bid");

    if (positionToBidIds[pos.id].length != 0) {
      // if we have bids need to check auction duration
      require(lastAuctionBidTs[pos.id] + AUCTION_DURATION > block.timestamp, "TPS: Auction ended");

      uint lastBidId = positionToBidIds[pos.id][positionToBidIds[pos.id].length - 1];
      AuctionBid storage lastBid = auctionBids[lastBidId];
      require(lastBid.amount * 110 / 100 < amount, "TPS: New bid lower than previous");
    }

    AuctionBid memory _bid = AuctionBid(
      auctionBidCounter,
      pos.id,
      lender,
      amount,
      true
    );

    positionToBidIds[pos.id].push(_bid.id);
    // write index + 1 for keep zero as empty value
    lenderOpenBids[lender][pos.id] = positionToBidIds[pos.id].length;

    IERC20(pos.acquired.acquiredToken).safeTransferFrom(_msgSender(), address(this), amount);

    lastAuctionBidTs[pos.id] = block.timestamp;
    auctionBids[_bid.id] = _bid;
    auctionBidCounter++;
    emit AuctionBidOpened(pos.id, _bid.id, amount, lender);
  }

  /// @dev Finalize position. Remove position from indexes
  function _endPosition(Position storage pos) internal {
    require(pos.execution.posEndTs == 0, "TPS: Position claimed");
    pos.open = false;
    pos.execution.posEndTs = block.timestamp;
    borrowerPositions[pos.borrower].removeIndexed(posIndexes[IndexType.BORROWER_POSITION], pos.id);
    if (pos.execution.lender != address(0)) {
      lenderPositions[pos.execution.lender].removeIndexed(posIndexes[IndexType.LENDER_POSITION], pos.id);
    }

  }

  /// @dev Transfer collateral from sender to recipient
  function _transferCollateral(PositionCollateral memory _collateral, address _sender, address _recipient) internal {
    if (_collateral.collateralType == AssetType.ERC20) {
      if (_sender == address(this)) {
        IERC20(_collateral.collateralToken).safeTransfer(_recipient, _collateral.collateralAmount);
      } else {
        IERC20(_collateral.collateralToken).safeTransferFrom(_sender, _recipient, _collateral.collateralAmount);
      }
    } else if (_collateral.collateralType == AssetType.ERC721) {
      IERC721(_collateral.collateralToken).safeTransferFrom(_sender, _recipient, _collateral.collateralTokenId);
    } else {
      revert("TPS: Wrong asset type");
    }
  }

  /// @dev Transfer fee to platform. Assume that token inside this contract
  ///      Do buyback if possible, otherwise just send to controller for manual handling
  function _transferFee(address token, uint amount) internal {
    // little deals can have zero fees
    if (amount == 0) {
      return;
    }
    IERC20(token).safeTransfer(feeRecipient, amount);
  }

  /// @dev Remove position from common indexes
  function _removePosFromIndexes(Position memory _pos) internal {
    openPositions.removeIndexed(posIndexes[IndexType.LIST], _pos.id);
    positionsByCollateral[_pos.collateral.collateralToken].removeIndexed(posIndexes[IndexType.BY_COLLATERAL], _pos.id);
    positionsByAcquired[_pos.acquired.acquiredToken].removeIndexed(posIndexes[IndexType.BY_ACQUIRED], _pos.id);
  }

  // ************* VIEWS **************************

  /// @inheritdoc ITetuPawnShop
  function toRedeem(uint id) external view override returns (uint){
    return _toRedeem(id);
  }

  function _toRedeem(uint id) private view returns (uint){
    Position memory pos = positions[id];
    return pos.acquired.acquiredAmount +
    (pos.acquired.acquiredAmount * pos.info.posFee / DENOMINATOR);
  }

  /// @inheritdoc ITetuPawnShop
  function getAssetType(address _token) external view override returns (AssetType){
    return _getAssetType(_token);
  }

  function _getAssetType(address _token) private view returns (AssetType){
    if (_isERC721(_token)) {
      return AssetType.ERC721;
    } else if (_isERC20(_token)) {
      return AssetType.ERC20;
    } else {
      revert("TPS: Unknown asset");
    }
  }

  /// @dev Return true if given token is ERC721 token
  function isERC721(address _token) external view override returns (bool) {
    return _isERC721(_token);
  }

  //noinspection NoReturn
  function _isERC721(address _token) private view returns (bool) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IERC721(_token).supportsInterface{gas: 30000}(type(IERC721).interfaceId) returns (bool result){
      return result;
    } catch {
      return false;
    }
  }

  /// @dev Return true if given token is ERC20 token
  function isERC20(address _token) external view override returns (bool) {
    return _isERC20(_token);
  }

  //noinspection NoReturn
  function _isERC20(address _token) private view returns (bool) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IERC20(_token).totalSupply{gas: 30000}() returns (uint){
      return true;
    } catch {
      return false;
    }
  }

  /// @inheritdoc ITetuPawnShop
  function openPositionsSize() external view override returns (uint) {
    return openPositions.length;
  }

  /// @inheritdoc ITetuPawnShop
  function auctionBidSize(uint posId) external view override returns (uint) {
    return positionToBidIds[posId].length;
  }

  function positionsByCollateralSize(address collateral) external view override returns (uint) {
    return positionsByCollateral[collateral].length;
  }

  function positionsByAcquiredSize(address acquiredToken) external view override returns (uint) {
    return positionsByAcquired[acquiredToken].length;
  }

  function borrowerPositionsSize(address borrower) external view override returns (uint) {
    return borrowerPositions[borrower].length;
  }

  function lenderPositionsSize(address lender) external view override returns (uint) {
    return lenderPositions[lender].length;
  }

  /// @inheritdoc ITetuPawnShop
  function getPosition(uint posId) external view override returns (Position memory) {
    return positions[posId];
  }

  /// @inheritdoc ITetuPawnShop
  function getAuctionBid(uint bidId) external view override returns (AuctionBid memory) {
    return auctionBids[bidId];
  }

  // ************* GOVERNANCE ACTIONS *************

  /// @inheritdoc ITetuPawnShop
  function announceGovernanceAction(
    GovernanceAction id,
    address addressValue,
    uint uintValue
  ) external onlyOwner override {
    require(timeLocks[id].time == 0, "TPS: Already announced");
    timeLocks[id] = TimeLock(
      block.timestamp + TIME_LOCK,
      addressValue,
      uintValue
    );
    emit GovernanceActionAnnounced(uint(id), addressValue, uintValue);
  }

  /// @inheritdoc ITetuPawnShop
  function setOwner(address _newOwner) external onlyOwner override
  checkTimeLock(GovernanceAction.ChangeOwner, _newOwner, 0) {
    require(_newOwner != address(0), "TPS: Zero address");
    emit OwnerChanged(owner, _newOwner);
    owner = _newOwner;
  }

  /// @inheritdoc ITetuPawnShop
  function setFeeRecipient(address _newFeeRecipient) external onlyOwner override
  checkTimeLock(GovernanceAction.ChangeFeeRecipient, _newFeeRecipient, 0) {
    require(_newFeeRecipient != address(0), "TPS: Zero address");
    emit FeeRecipientChanged(feeRecipient, _newFeeRecipient);
    feeRecipient = _newFeeRecipient;
  }

  /// @inheritdoc ITetuPawnShop
  function setPlatformFee(uint _value) external onlyOwner override
  checkTimeLock(GovernanceAction.ChangePlatformFee, address(0), _value) {
    require(_value <= PLATFORM_FEE_MAX, "TPS: Too high fee");
    emit PlatformFeeChanged(platformFee, _value);
    platformFee = _value;
  }

  /// @inheritdoc ITetuPawnShop
  function setPositionDepositAmount(uint _value) external onlyOwner override
  checkTimeLock(GovernanceAction.ChangePositionDepositAmount, address(0), _value) {
    emit DepositAmountChanged(positionDepositAmount, _value);
    positionDepositAmount = _value;
  }

  /// @inheritdoc ITetuPawnShop
  function setPositionDepositToken(address _value) external onlyOwner override
  checkTimeLock(GovernanceAction.ChangePositionDepositToken, _value, 0) {
    emit DepositTokenChanged(positionDepositToken, _value);
    positionDepositToken = _value;
  }

  /// @dev Delegate snapshot votes to another address
  function delegateVotes(address _delegateContract,bytes32 _id, address _delegate) external onlyOwner {
    IDelegation(_delegateContract).setDelegate(_id, _delegate);
  }

  /// @dev Remove delegated votes.
  function clearDelegatedVotes(address _delegateContract, bytes32 _id) external onlyOwner {
    IDelegation(_delegateContract).clearDelegate(_id);
  }
}
