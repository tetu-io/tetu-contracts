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

import "../base/governance/ControllableV2.sol";
import "../infrastructure/price/IPriceCalculator.sol";
import "../loan/ITetuPawnShop.sol";
import "../openzeppelin/Math.sol";

/// @title View data reader for using on website UI and other integrations
/// @author belbix
contract PawnShopReader is Initializable, ControllableV2 {

  string public constant VERSION = "1.0.1";
  uint256 constant public PRECISION = 1e18;
  string private constant _CALCULATOR = "calculator";
  string private constant _SHOP = "shop";

  // DO NOT CHANGE NAMES OR ORDERING!
  mapping(bytes32 => address) internal tools;

  function initialize(address _controller, address _calculator, address _pawnshop) external initializer {
    ControllableV2.initializeControllable(_controller);
    tools[keccak256(abi.encodePacked(_CALCULATOR))] = _calculator;
    tools[keccak256(abi.encodePacked(_SHOP))] = _pawnshop;
  }

  /// @dev Allow operation only for Controller or Governance
  modifier onlyControllerOrGovernance() {
    require(_isController(msg.sender) || _isGovernance(msg.sender), "Not controller or gov");
    _;
  }

  event ToolAddressUpdated(string name, address newValue);

  // ************** READ FUNCTIONS **************

  function positions(uint256 from, uint256 to) external view returns (ITetuPawnShop.Position[] memory){
    uint256 size = pawnshop().positionCounter();
    if (size == 1) {
      return new ITetuPawnShop.Position[](0);
    }
    if (from == 0) {
      from = 1;
    }
    to = Math.min(size - 1, to);
    ITetuPawnShop.Position[] memory result = new ITetuPawnShop.Position[](to - from + 1);

    uint256 j = 0;
    for (uint256 i = from; i <= to; i++) {
      result[j] = pawnshop().getPosition(i);
      j++;
    }

    return result;
  }

  function openPositions(uint256 from, uint256 to) external view returns (ITetuPawnShop.Position[] memory){
    uint256 size = pawnshop().openPositionsSize();
    if (size == 0) {
      return new ITetuPawnShop.Position[](0);
    }
    to = Math.min(size - 1, to);
    ITetuPawnShop.Position[] memory result = new ITetuPawnShop.Position[](to - from + 1);

    uint256 j = 0;
    for (uint256 i = from; i <= to; i++) {
      result[j] = pawnshop().getPosition(pawnshop().openPositions(i));
      j++;
    }

    return result;
  }

  function positionsByCollateral(
    address collateral,
    uint256 from,
    uint256 to
  ) external view returns (ITetuPawnShop.Position[] memory){
    uint256 size = pawnshop().positionsByCollateralSize(collateral);
    if (size == 0) {
      return new ITetuPawnShop.Position[](0);
    }
    to = Math.min(size - 1, to);
    ITetuPawnShop.Position[] memory result = new ITetuPawnShop.Position[](to - from + 1);

    uint256 j = 0;
    for (uint256 i = from; i <= to; i++) {
      result[j] = pawnshop().getPosition(pawnshop().positionsByCollateral(collateral, i));
      j++;
    }

    return result;
  }

  function positionsByAcquired(
    address acquired,
    uint256 from,
    uint256 to
  ) external view returns (ITetuPawnShop.Position[] memory){
    uint256 size = pawnshop().positionsByAcquiredSize(acquired);
    if (size == 0) {
      return new ITetuPawnShop.Position[](0);
    }
    to = Math.min(size - 1, to);
    ITetuPawnShop.Position[] memory result = new ITetuPawnShop.Position[](to - from + 1);

    uint256 j = 0;
    for (uint256 i = from; i <= to; i++) {
      result[j] = pawnshop().getPosition(pawnshop().positionsByAcquired(acquired, i));
      j++;
    }

    return result;
  }

  function borrowerPositions(
    address borrower,
    uint256 from,
    uint256 to
  ) external view returns (ITetuPawnShop.Position[] memory){
    uint256 size = pawnshop().borrowerPositionsSize(borrower);
    if (size == 0) {
      return new ITetuPawnShop.Position[](0);
    }
    to = Math.min(size - 1, to);
    ITetuPawnShop.Position[] memory result = new ITetuPawnShop.Position[](to - from + 1);

    uint256 j = 0;
    for (uint256 i = from; i <= to; i++) {
      result[j] = pawnshop().getPosition(pawnshop().borrowerPositions(borrower, i));
      j++;
    }

    return result;
  }

  function lenderPositions(
    address lender,
    uint256 from,
    uint256 to
  ) external view returns (ITetuPawnShop.Position[] memory){
    uint256 size = pawnshop().lenderPositionsSize(lender);
    if (size == 0) {
      return new ITetuPawnShop.Position[](0);
    }
    to = Math.min(size - 1, to);
    ITetuPawnShop.Position[] memory result = new ITetuPawnShop.Position[](to - from + 1);

    uint256 j = 0;
    for (uint256 i = from; i <= to; i++) {
      result[j] = pawnshop().getPosition(pawnshop().lenderPositions(lender, i));
      j++;
    }

    return result;
  }

  function auctionBids(uint256 from, uint256 to) external view returns (ITetuPawnShop.AuctionBid[] memory){
    uint256 size = pawnshop().auctionBidCounter();
    if (size == 1) {
      return new ITetuPawnShop.AuctionBid[](0);
    }
    if (from == 0) {
      from = 1;
    }
    to = Math.min(size - 1, to);
    ITetuPawnShop.AuctionBid[] memory result = new ITetuPawnShop.AuctionBid[](to - from + 1);

    uint256 j = 0;
    for (uint256 i = from; i <= to; i++) {
      result[j] = pawnshop().getAuctionBid(i);
      j++;
    }

    return result;
  }

  function lenderAuctionBid(address lender, uint256 posId) external view returns (ITetuPawnShop.AuctionBid memory){
    uint256 index = pawnshop().lenderOpenBids(lender, posId) - 1;
    uint256 bidId = pawnshop().positionToBidIds(posId, index);
    return pawnshop().getAuctionBid(bidId);
  }

  function positionAuctionBids(uint256 posId, uint256 from, uint256 to) external view returns (ITetuPawnShop.AuctionBid[] memory){
    uint256 size = pawnshop().auctionBidSize(posId);
    if (size == 0) {
      return new ITetuPawnShop.AuctionBid[](0);
    }
    to = Math.min(size - 1, to);
    ITetuPawnShop.AuctionBid[] memory result = new ITetuPawnShop.AuctionBid[](to - from + 1);

    uint256 j = 0;
    for (uint256 i = from; i <= to; i++) {
      result[j] = pawnshop().getAuctionBid(pawnshop().positionToBidIds(posId, i));
      j++;
    }

    return result;
  }

  // ******************** COMMON VIEWS ********************

  // normalized precision
  //noinspection NoReturn
  function getPrice(address _token) public view returns (uint256) {
    //slither-disable-next-line unused-return,variable-scope,uninitialized-local
    try priceCalculator().getPriceWithDefaultOutput(_token) returns (uint256 price){
      return price;
    } catch {
      return 0;
    }
  }

  function normalizePrecision(uint256 amount, uint256 decimals) internal pure returns (uint256){
    return amount * PRECISION / (10 ** decimals);
  }

  function priceCalculator() public view returns (IPriceCalculator) {
    return IPriceCalculator(tools[keccak256(abi.encodePacked(_CALCULATOR))]);
  }

  function pawnshop() public view returns (ITetuPawnShop) {
    return ITetuPawnShop(tools[keccak256(abi.encodePacked(_SHOP))]);
  }

  // *********** GOVERNANCE ACTIONS *****************

  function setPriceCalculator(address newValue) external onlyControllerOrGovernance {
    tools[keccak256(abi.encodePacked(_CALCULATOR))] = newValue;
    emit ToolAddressUpdated(_CALCULATOR, newValue);
  }

  function setPawnShop(address newValue) external onlyControllerOrGovernance {
    tools[keccak256(abi.encodePacked(_SHOP))] = newValue;
    emit ToolAddressUpdated(_SHOP, newValue);
  }

}
