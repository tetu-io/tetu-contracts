pragma solidity 0.8.4;

interface IAToken {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);
}
