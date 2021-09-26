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
import "../base/governance/Controllable.sol";
import "./ITetuPawnShop.sol";
import "../base/interface/IFeeRewardForwarder.sol";
import "../base/ArrayLib.sol";

/// @title Contract for handling deals between two parties
/// @author belbix
contract TetuPawnShop is ERC721Holder, Controllable, ReentrancyGuard, ITetuPawnShop {
  using SafeERC20 for IERC20;
  using Address for address;
  using SafeMath for uint256;
  using ArrayLib for uint256[];

  /// @dev Tetu Controller address requires for governance actions
  constructor(address _controller) {
    Controllable.initializeControllable(_controller);
  }

  // ---- CONSTANTS

  /// @notice Version of the contract
  /// @dev Should be incremented when contract changed
  string public constant VERSION = "1.1.0";
  /// @dev Denominator for any internal computation with low precision
  uint256 constant public DENOMINATOR = 10000;
  /// @dev Governance can't set fee more than this value
  uint256 constant public PLATFORM_FEE_MAX = 500; // 5%
  /// @dev Standard auction duration that refresh when a new bid placed
  uint256 constant public AUCTION_DURATION = 1 days;

  // ---- CHANGEABLE VARIABLES

  /// @dev 1% by default, percent of acquired tokens that will be used for buybacks
  uint256 public platformFee = 10;
  /// @dev Amount of tokens for open position. Protection against spam
  ///      1000 TETU by default
  uint256 public positionDepositAmount = 1000 * 1e18;
  /// @dev Token for antispam protection. TETU assumed
  ///      Zero address means no protection
  address public positionDepositToken;

  // ---- POSITIONS

  /// @dev PosId counter. Should start from 1 for keep 0 as empty value
  uint256 public positionCounter = 1;
  /// @dev PosId => Position. Hold all positions. Any record should not be removed
  mapping(uint256 => Position) public positions;
  /// @inheritdoc ITetuPawnShop
  uint256[] public override positionsList;
  /// @inheritdoc ITetuPawnShop
  mapping(address => uint256[]) public override positionsByCollateral;
  /// @inheritdoc ITetuPawnShop
  mapping(address => uint256[]) public override positionsByAcquired;
  /// @inheritdoc ITetuPawnShop
  mapping(address => uint256[]) public override borrowerPositions;
  /// @inheritdoc ITetuPawnShop
  mapping(address => uint256[]) public override lenderPositions;
  /// @inheritdoc ITetuPawnShop
  mapping(IndexType => mapping(uint256 => uint256)) public override posIndexes;

  // ---- AUCTION

  /// @dev BidId counter. Should start from 1 for keep 0 as empty value
  uint256 public auctionBidCounter = 1;
  /// @dev BidId => Bid. Hold all bids. Any record should not be removed
  mapping(uint256 => AuctionBid) public auctionBids;
  /// @inheritdoc ITetuPawnShop
  mapping(address => mapping(uint256 => uint256)) public override lenderOpenBids;
  /// @inheritdoc ITetuPawnShop
  mapping(uint256 => uint256[]) public override positionToBidIds;
  /// @inheritdoc ITetuPawnShop
  mapping(uint256 => uint256) public override lastAuctionBidTs;

  // ************* USER ACTIONS *************

  /// @inheritdoc ITetuPawnShop
  function openPosition(
    address _collateralToken,
    uint256 _collateralAmount,
    uint256 _collateralTokenId,
    address _acquiredToken,
    uint256 _acquiredAmount,
    uint256 _posDurationBlocks,
    uint256 _posFee
  ) external onlyAllowedUsers nonReentrant override returns (uint256){
    require(_posFee <= DENOMINATOR * 10, "TL: Pos fee absurdly high");
    require(_posDurationBlocks != 0 || _posFee == 0, "TL: Fee for instant deal forbidden");
    require(_collateralAmount == 0 || _collateralTokenId == 0, "TL: Wrong amounts");
    require(_collateralToken != address(0), "TL: Zero cToken");
    require(_acquiredToken != address(0), "TL: Zero aToken");

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
        getAssetType(_collateralToken),
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
        msg.sender, // borrower
        positionDepositToken,
        positionDepositAmount,
        true, // open
        info,
        collateral,
        acquired,
        execution
      );
    }

    positionsList.push(pos.id);
    posIndexes[IndexType.LIST][pos.id] = positionsList.length - 1;

    positionsByCollateral[_collateralToken].push(pos.id);
    posIndexes[IndexType.BY_COLLATERAL][pos.id] = positionsByCollateral[_collateralToken].length - 1;

    positionsByAcquired[_acquiredToken].push(pos.id);
    posIndexes[IndexType.BY_ACQUIRED][pos.id] = positionsByAcquired[_acquiredToken].length - 1;

    borrowerPositions[msg.sender].push(pos.id);
    posIndexes[IndexType.BORROWER_POSITION][pos.id] = borrowerPositions[msg.sender].length - 1;

    positions[pos.id] = pos;
    positionCounter++;

    _takeDeposit(pos.id);
    _transferCollateral(pos.collateral, msg.sender, address(this));
    emit PositionOpened(pos.id);
    return pos.id;
  }

  /// @inheritdoc ITetuPawnShop
  function closePosition(uint256 id) external onlyAllowedUsers nonReentrant override {
    Position storage pos = positions[id];
    require(pos.id == id, "TL: Wrong ID");
    require(pos.borrower == msg.sender, "TL: Only borrower can close a position");
    require(pos.execution.lender == address(0), "TL: Can't close executed position");
    require(pos.open, "TL: Position closed");

    _removePosFromIndexes(pos);
    borrowerPositions[pos.borrower].removeIndexed(posIndexes[IndexType.BORROWER_POSITION], pos.id);

    _transferCollateral(pos.collateral, address(this), pos.borrower);
    _returnDeposit(id);
    pos.open = false;
    emit PositionClosed(id);
  }

  /// @inheritdoc ITetuPawnShop
  function bid(uint256 id, uint256 amount) external onlyAllowedUsers nonReentrant override {
    Position storage pos = positions[id];
    require(pos.id == id, "TL: Wrong ID");
    require(pos.open, "TL: Position closed");
    require(pos.execution.lender == address(0), "TL: Can't bid executed position");
    if (pos.acquired.acquiredAmount != 0) {
      require(amount == pos.acquired.acquiredAmount, "TL: Wrong bid amount");
      _executeBid(pos, amount, msg.sender, msg.sender);
    } else {
      _auctionBid(pos, amount, msg.sender);
    }
  }

  /// @inheritdoc ITetuPawnShop
  function claim(uint256 id) external onlyAllowedUsers nonReentrant override {
    Position storage pos = positions[id];
    require(pos.id == id, "TL: Wrong ID");
    require(pos.execution.lender == msg.sender, "TL: Only lender can claim");
    uint256 posEnd = pos.execution.posStartBlock + pos.info.posDurationBlocks;
    require(posEnd < block.number, "TL: Too early to claim");

    _endPosition(pos);
    _transferCollateral(pos.collateral, address(this), msg.sender);
    _returnDeposit(id);
    pos.open = false;
    emit PositionClaimed(id);
  }

  /// @inheritdoc ITetuPawnShop
  function redeem(uint256 id) external onlyAllowedUsers nonReentrant override {
    Position storage pos = positions[id];
    require(pos.id == id, "TL: Wrong ID");
    require(pos.borrower == msg.sender, "TL: Only borrower can redeem");
    require(pos.execution.lender != address(0), "TL: Not executed position");

    _endPosition(pos);
    uint256 toSend = toRedeem(id);
    IERC20(pos.acquired.acquiredToken).safeTransferFrom(msg.sender, pos.execution.lender, toSend);
    _transferCollateral(pos.collateral, address(this), msg.sender);
    _returnDeposit(id);
    pos.open = false;
    emit PositionRedeemed(id);
  }

  /// @inheritdoc ITetuPawnShop
  function acceptAuctionBid(uint256 posId) external onlyAllowedUsers nonReentrant override {
    require(lastAuctionBidTs[posId] + AUCTION_DURATION < block.timestamp, "TL: Auction not ended");
    require(positionToBidIds[posId].length > 0, "TL: No bids");
    uint256 bidId = positionToBidIds[posId][positionToBidIds[posId].length - 1];

    AuctionBid storage _bid = auctionBids[bidId];
    require(_bid.id != 0, "TL: Auction bid not found");
    require(_bid.open, "TL: Bid closed");
    require(_bid.posId == posId, "TL: Wrong bid");

    Position storage pos = positions[posId];
    require(pos.borrower == msg.sender, "TL: Not borrower");
    require(pos.open, "TL: Position closed");

    pos.acquired.acquiredAmount = _bid.amount;
    _executeBid(pos, _bid.amount, address(this), _bid.lender);
    lenderOpenBids[_bid.lender][pos.id] = 0;
    _bid.open = false;
    emit AuctionBidAccepted(posId, _bid.id);
  }

  /// @inheritdoc ITetuPawnShop
  function closeAuctionBid(uint256 bidId) external onlyAllowedUsers nonReentrant override {
    AuctionBid storage _bid = auctionBids[bidId];
    require(_bid.id != 0, "TL: Auction bid not found");
    Position storage pos = positions[_bid.posId];

    bool isAuctionEnded = lastAuctionBidTs[pos.id] + AUCTION_DURATION < block.timestamp;
    bool isLastBid = false;
    if (positionToBidIds[pos.id].length != 0) {
      uint256 lastBidId = positionToBidIds[pos.id][positionToBidIds[pos.id].length - 1];
      isLastBid = lastBidId == bidId;
    }
    require((isLastBid && isAuctionEnded) || !isLastBid || !pos.open, "TL: Auction is not ended");

    lenderOpenBids[_bid.lender][pos.id] = 0;
    _bid.open = false;
    IERC20(pos.acquired.acquiredToken).safeTransfer(msg.sender, _bid.amount);
    emit AuctionBidClosed(pos.id, bidId);
  }

  // ************* INTERNAL FUNCTIONS *************

  /// @dev Transfer to this contract a deposit
  function _takeDeposit(uint256 posId) internal {
    Position storage pos = positions[posId];
    if (pos.depositToken != address(0)) {
      IERC20(pos.depositToken).safeTransferFrom(pos.borrower, address(this), pos.depositAmount);
    }
  }

  /// @dev Return to borrower a deposit
  function _returnDeposit(uint256 posId) internal {
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
    uint256 amount,
    address acquiredMoneyHolder,
    address lender
  ) internal {
    uint256 feeAmount = amount * platformFee / DENOMINATOR;
    _transferFee(pos.acquired.acquiredToken, acquiredMoneyHolder, feeAmount);
    uint256 toSend = amount - feeAmount;
    if (acquiredMoneyHolder == address(this)) {
      IERC20(pos.acquired.acquiredToken).safeTransfer(pos.borrower, toSend);
    } else {
      IERC20(pos.acquired.acquiredToken).safeTransferFrom(acquiredMoneyHolder, pos.borrower, toSend);
    }

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
    emit BidExecuted(pos.id, lender, amount);
  }

  /// @dev Open an auction bid
  ///      Transfer acquired token to this contract
  function _auctionBid(Position storage pos, uint256 amount, address lender) internal {
    require(lenderOpenBids[lender][pos.id] == 0, "TL: Auction bid already exist");

    if (positionToBidIds[pos.id].length != 0) {
      // if we have bids need to check auction duration
      require(lastAuctionBidTs[pos.id] + AUCTION_DURATION > block.timestamp, "TL: Auction ended");

      uint256 lastBidId = positionToBidIds[pos.id][positionToBidIds[pos.id].length - 1];
      AuctionBid storage lastBid = auctionBids[lastBidId];
      require(lastBid.amount < amount, "TL: New bid lower than previous");
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

    IERC20(pos.acquired.acquiredToken).safeTransferFrom(msg.sender, address(this), amount);

    lastAuctionBidTs[pos.id] = block.timestamp;
    auctionBids[_bid.id] = _bid;
    auctionBidCounter++;
    emit AuctionBidOpened(pos.id, _bid.id);
  }

  /// @dev Finalize position. Remove position from indexes
  function _endPosition(Position storage pos) internal {
    require(pos.execution.posEndTs == 0, "TL: Position claimed");
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
      revert("TL: Wrong asset type");
    }
  }

  /// @dev Transfer fee to platform.
  ///      Do buyback if possible, otherwise just send to controller for manual handling
  function _transferFee(address token, address from, uint256 amount) internal {
    // little deals can have zero fees
    if (amount == 0) {
      return;
    }
    IFeeRewardForwarder forwarder = IFeeRewardForwarder(IController(controller()).feeRewardForwarder());
    address targetToken = IController(controller()).rewardToken();

    IERC20(token).safeTransferFrom(from, address(this), amount);
    IERC20(token).safeApprove(address(forwarder), 0);
    IERC20(token).safeApprove(address(forwarder), amount);

    // try to buy target token and if no luck send it to controller
    // should have gas limitation for not breaking the main logic
    try forwarder.liquidate{gas : 2_000_000}(token, targetToken, amount) returns (uint256 amountOut) {
      // send to controller
      IERC20(targetToken).safeTransfer(controller(), amountOut);
    } catch {
      // it will be manually handled in the controller
      IERC20(token).safeTransfer(controller(), amount);
    }
  }

  /// @dev Remove position from common indexes
  function _removePosFromIndexes(Position memory _pos) internal {
    positionsList.removeIndexed(posIndexes[IndexType.LIST], _pos.id);
    positionsByCollateral[_pos.collateral.collateralToken].removeIndexed(posIndexes[IndexType.BY_COLLATERAL], _pos.id);
    positionsByAcquired[_pos.acquired.acquiredToken].removeIndexed(posIndexes[IndexType.BY_ACQUIRED], _pos.id);
  }

  // ************* VIEWS **************************

  /// @inheritdoc ITetuPawnShop
  function toRedeem(uint256 id) public view override returns (uint256){
    Position memory pos = positions[id];
    return pos.acquired.acquiredAmount +
    (pos.acquired.acquiredAmount * pos.info.posFee / DENOMINATOR);
  }

  /// @inheritdoc ITetuPawnShop
  function getAssetType(address _token) public view override returns (AssetType){
    if (isERC721(_token)) {
      return AssetType.ERC721;
    } else if (isERC20(_token)) {
      return AssetType.ERC20;
    } else {
      revert("TL: Unknown asset");
    }
  }

  //noinspection NoReturn
  function isERC721(address _token) public view override returns (bool) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IERC721(_token).supportsInterface{gas : 30000}(type(IERC721).interfaceId) returns (bool result){
      return result;
    } catch {
      return false;
    }
  }

  //noinspection NoReturn
  function isERC20(address _token) public view override returns (bool) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try IERC20(_token).totalSupply{gas : 30000}() returns (uint256){
      return true;
    } catch {
      return false;
    }
  }

  /// @inheritdoc ITetuPawnShop
  function positionsListSize() external view override returns (uint256) {
    return positionsList.length;
  }

  /// @inheritdoc ITetuPawnShop
  function auctionBidSize(uint256 posId) external view override returns (uint256) {
    return positionToBidIds[posId].length;
  }

  /// @inheritdoc ITetuPawnShop
  function getPosition(uint256 posId) external view override returns (Position memory) {
    return positions[posId];
  }

  /// @inheritdoc ITetuPawnShop
  function getAuctionBid(uint256 bidId) external view override returns (AuctionBid memory) {
    return auctionBids[bidId];
  }

  // ************* GOVERNANCE ACTIONS *************

  /// @inheritdoc ITetuPawnShop
  function setPlatformFee(uint256 _value) external onlyControllerOrGovernance override {
    require(_value <= PLATFORM_FEE_MAX, "TL: Too high fee");
    platformFee = _value;
  }

  /// @inheritdoc ITetuPawnShop
  function setPositionDepositAmount(uint256 _value) external onlyControllerOrGovernance override {
    positionDepositAmount = _value;
  }

  /// @inheritdoc ITetuPawnShop
  function setPositionDepositToken(address _value) external onlyControllerOrGovernance override {
    positionDepositToken = _value;
  }
}
