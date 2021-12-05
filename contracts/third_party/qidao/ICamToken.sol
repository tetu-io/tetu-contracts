// SPDX-License-Identifier: agpl-3.0
// Original contract: https://github.com/0xlaozi/qidao/blob/main/contracts/camWMatic.sol

pragma solidity ^0.8.4;

//import "@openzeppelin/contracts/math/SafeMath.sol";

//import "./interfaces/IAaveIncentivesController.sol";
//import "./interfaces/ILendingPool.sol";

// stake Token to earn more Token (from farming)
// This contract handles swapping to and from uMiMatic, a staked version of miMatic stable coin.
interface ICamToken {

//    address public Token;
//    address public AaveContract;
//    address public wMatic;
//    address public constant LENDING_POOL = 0x8dFf5E27EA6b7AC08EbFdf9eB090F32ee9a30fcf;
//
//    address public treasury;
//
//    address public operator;
    function operator() external returns (address);
//
//    uint16 public depositFeeBP;
    function depositFeeBP() external returns (uint16);

    // Define the compounding aave market token contract
//    constructor() public {
//        Token = 0x8dF3aad3a84da6b69A4DA8aeC3eA40d9091B2Ac4; //amWMatic
//
//        AaveContract = 0x357D51124f59836DeD84c8a1730D72B749d8BC23; // aave incentives controller
//        wMatic = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
//
//        treasury = 0x86fE8d6D4C8A007353617587988552B6921514Cb;
//        depositFeeBP = 0;
//
//        operator = address(0);
//    }


    function updateOperator(address _operator) external;

    function updateTreasury(address _treasury) external;

    function updateDepositFee(uint16 _depositFee) external;

    // Locks amToken and mints camToken (shares)
    function enter(uint256 _amount) external;

    function claimAaveRewards() external;

    //function harvestMaticIntoToken() external; // not present at blockchain

    // claim amToken by burning camToken
    function leave(uint256 _share) external;
}
