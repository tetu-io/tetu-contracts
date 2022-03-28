// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "../third_party/qidao/IPriceSourceAll.sol";


/// @title Mai Stablecoin Pipe Mocked Price Source Contract (Used for tests only)
/// @author bogdoslav
contract MockPriceSourceAll is IPriceSourceAll {

    uint256 public price;
    uint8 public override decimals;

    constructor(uint256 _price) {
        price = _price;
    }

    /// @dev Sets mock price
    /// @param _price - mock price
    function setPrice(uint256 _price) public {
        price = _price;
    }

    function setDecimals(uint8 _decimals) public {
        decimals = _decimals;
    }

    /// @dev Gets latestRoundData
    function latestRoundData()
    override external view returns (uint256 answer) {
        return price;
    }

    function latestAnswer()
    override external view returns (uint256) {
        return price;
    }


}
