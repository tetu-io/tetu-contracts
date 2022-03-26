// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "../third_party/qidao/PriceSource.sol";


/// @title Mai Stablecoin Pipe Mocked Price Source Contract (Used for tests only)
/// @author bogdoslav
contract MockPriceSource is PriceSource {

    int256 public price;

    constructor(int256 _price) {
        price = _price;
    }

    /// @dev Sets mock price
    /// @param _price - mock price
    function setPrice(int256 _price) public {
        price = _price;
    }

    /// @dev Gets latestRoundData
    function latestRoundData()
    override external view returns
    (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) {
        return (0,price,0,0,0);
    }


}
