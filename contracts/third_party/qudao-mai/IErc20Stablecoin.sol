//https://github.com/0xlaozi/qidao/blob/main/contracts/erc20Stablecoin/erc20Stablecoin.sol
pragma solidity 0.8.4;

interface IErc20Stablecoin {
//    PriceSource public ethPriceSource;
//
//    uint256 public _minimumCollateralPercentage;
//
//    uint256 public vaultCount;
//    uint256 public closingFee;
//    uint256 public openingFee;
//
//    uint256 public treasury;
//    uint256 public tokenPeg;
//
//    mapping(uint256 => uint256) public vaultCollateral;
//    mapping(uint256 => uint256) public vaultDebt;
//
//    uint256 public debtRatio;
//    uint256 public gainRatio;
//
//    address public stabilityPool;
//
//    ERC20Detailed public collateral;
//
//    ERC20Detailed public mai;
//
//    uint8 public priceSourceDecimals;

//    mapping(address => uint256) public maticDebt;


    function getDebtCeiling() public view returns (uint256);

    function exists(uint256 vaultID) public view returns (bool);

    function getClosingFee() public view returns (uint256);

    function getOpeningFee() public view returns (uint256);

    function getTokenPriceSource() public view returns (uint256);

    function getEthPriceSource() public view returns (uint256);

    function createVault() public returns (uint256);

    function destroyVault(uint256 vaultID) public;

    function depositCollateral(uint256 vaultID, uint256 amount) public;

    function withdrawCollateral(uint256 vaultID, uint256 amount) public;

    function borrowToken(uint256 vaultID, uint256 amount) public;

    function payBackToken(uint256 vaultID, uint256 amount) public;

    function getPaid() public;

    function checkCost(uint256 vaultID) public view returns (uint256);

    function checkExtract(uint256 vaultID) public view returns (uint256);

    function checkCollateralPercentage(uint256 vaultID) public view returns(uint256);

    function checkLiquidation(uint256 vaultID) public view returns (bool);

    function liquidateVault(uint256 vaultID) public;
}
