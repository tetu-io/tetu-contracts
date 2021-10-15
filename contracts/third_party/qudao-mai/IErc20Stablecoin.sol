//https://github.com/0xlaozi/qidao/blob/main/contracts/erc20Stablecoin/erc20Stablecoin.sol
pragma solidity 0.8.4;

interface IErc20Stablecoin {
//    PriceSource external ethPriceSource;
//
//    uint256 external _minimumCollateralPercentage;
//
//    uint256 external vaultCount;
//    uint256 external closingFee;
//    uint256 external openingFee;
//
//    uint256 external treasury;
//    uint256 external tokenPeg;
//
//    mapping(uint256 => uint256) external vaultCollateral;
//    mapping(uint256 => uint256) external vaultDebt;
//
//    uint256 external debtRatio;
//    uint256 external gainRatio;
//
//    address external stabilityPool;
//
//    ERC20Detailed external collateral;
//
//    ERC20Detailed external mai;
//
//    uint8 external priceSourceDecimals;

//    mapping(address => uint256) external maticDebt;


    function getDebtCeiling() external view returns (uint256);

    function exists(uint256 vaultID) external view returns (bool);

    function getClosingFee() external view returns (uint256);

    function getOpeningFee() external view returns (uint256);

    function getTokenPriceSource() external view returns (uint256);

    function getEthPriceSource() external view returns (uint256);

    function createVault() external returns (uint256);

    function destroyVault(uint256 vaultID) external;

    function depositCollateral(uint256 vaultID, uint256 amount) external;

    function withdrawCollateral(uint256 vaultID, uint256 amount) external;

    function borrowToken(uint256 vaultID, uint256 amount) external;

    function payBackToken(uint256 vaultID, uint256 amount) external;

    function getPaid() external;

    function checkCost(uint256 vaultID) external view returns (uint256);

    function checkExtract(uint256 vaultID) external view returns (uint256);

    function checkCollateralPercentage(uint256 vaultID) external view returns(uint256);

    function checkLiquidation(uint256 vaultID) external view returns (bool);

    function liquidateVault(uint256 vaultID) external;
}
