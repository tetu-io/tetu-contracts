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

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./../../../../third_party/qudao-mai/ICamWMATIC.sol";
import "./../../../../third_party/qudao-mai/IErc20Stablecoin.sol";

contract MaiConnector {

    struct MaiData {
        address vault;
        address sourceToken;
        address lpToken;
        uint256 borrowPercentage;
        address borrowToken;
        address rewardToken;
        uint256 minPercentage;
        uint256 maxPercentage;
        uint256 targetPercentage;
    }

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    MaiData private d;

    constructor(
        MaiData memory _maiData
    ) {
        d = _maiData;
        require(d.minPercentage<d.targetPercentage && d.targetPercentage<d.maxPercentage, "MC: Wring percentages");
    }

    function _maiCreateVault() internal {
        //    MAI: create camMATIC vault
        //    https://polygonscan.com/tx/0x3f69c39b4ff0f3280d4277e0cc82d9dba3ff384a2ddad5890eb0960d55019dc2
        //    contract erc20QiStablecoin(camWMATIC MAI Vault (cMVT)) 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
        //    Function: createVault()

        IErc20Stablecoin(d.vault).createVault();
    }

    function _maiGetVaultID(uint256 index) public view returns (uint256) {
        return ERC721Enumerable(d.vault).tokenOfOwnerByIndex(address(this), index);
    }

    function _maiGetVaultID() public view returns (uint256) {
        return _maiGetVaultID(0);
    }

    function _maiEnterCamWMatic(uint256 amount) internal {
        //  MAI: approve, enter yield deposit amMATIC to camMATIC
        //  https://polygonscan.com/tx/0xc48fd433ef7145089daabed2dedd98f1c4598a8f50d7f7644dc2b91a7d41aad4
        //  Contract 0x8df3aad3a84da6b69a4da8aec3ea40d9091b2ac4 (Aave: amWMATIC Token)
        //  Function: approve(address spender, uint256 rawAmount)
        //  https://polygonscan.com/tx/0xfb7358d4bb2ec1cbd59b83e5e18705ac87d2c07166b328694da2b28115e7c6af
        //  Contract camWMATIC 0x7068ea5255cb05931efa8026bd04b18f3deb8b0b
        //  Function: enter(uint256 _amount)

        IERC20(d.sourceToken).safeApprove(d.lpToken, 0);
        IERC20(d.sourceToken).safeApprove(d.lpToken, amount);

        ICamWMATIC(d.lpToken).enter(amount);
    }

    function _maiLeaveCamWMatic(uint256 amount) internal {
        // MAI: withdraw amWMATIC
        // https://polygonscan.com/tx/0x72c13585c9c35f85b6fa70882f8bad80745689f09070df3eb1c54a8027c89f30


        ICamWMATIC(d.lpToken).leave(amount);
    }

    function _maiDepositCollateral(uint256 amount, uint256 _vaultID) internal {
        //  MAI: approve, deposit camMATIC to collateral
        //  https://polygonscan.com/tx/0x9f3040c242b164a4d28de2240c92375e59e17c90d24a584e7879d1b39a73a8ba
        //  Contract (camWMATIC) 0x7068ea5255cb05931efa8026bd04b18f3deb8b0b
        //  Function: approve(address spender, uint256 amount)
        //  https://polygonscan.com/tx/0x79c84484e88d71783272e994ababc5fc133cb91239ecc3e688fcf4668f2fd323
        //  Contract erc20QiStablecoin(camWMATIC MAI Vault (cMVT)) 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
        //  Function: depositCollateral(uint256 vaultID 0x53e, uint256 amount db037b6c4b33e8b)

        IERC20(d.lpToken).safeApprove(d.vault, 0);
        IERC20(d.lpToken).safeApprove(d.vault, amount);

        IErc20Stablecoin(d.vault).depositCollateral(_vaultID, amount);
    }

    function _maiDepositCollateral(uint256 amount) internal {
        _maiDepositCollateral(amount, _maiGetVaultID());
    }

    function _maiBorrowToken(uint256 amount, uint256 _vaultID) internal {
        //  MAI: borrow MAI (miMATIC) 33%  {QI airdrop}
        //  https://polygonscan.com/tx/0x61a10463ecd073c6d9e67a33d6c29c14909916bfbf076d870840d962516763da
        //  Contract erc20QiStablecoin(camWMATIC MAI Vault (cMVT)) 0x88d84a85a87ed12b8f098e8953b322ff789fcd1a
        //  Function: borrowToken(uint256 vaultID 0x53e, uint256 amount 368a5a82c9a940e)


        IErc20Stablecoin(d.vault).borrowToken(_vaultID, amount);
    }

    function _maiBorrowToken(uint256 amount) internal {
        _maiBorrowToken(amount,  _maiGetVaultID());
    }


    function _maiRepayToken(uint256 amount, uint256 _vaultID) internal {
        // MAI: repay miMATIC/MAI (0.5% fee)
        // https://polygonscan.com/tx/0x81e483a29d3ec3b3265db7d013eeb97968233cfae2d3989bc325e8b24ebc6e0f


        IErc20Stablecoin(d.vault).payBackToken(_vaultID, amount);
    }

    function _maiRepayToken(uint256 amount) internal {
        _maiRepayToken(amount,  _maiGetVaultID());
    }


    function _maiWithdrawCollateral(uint256 amount, uint256 _vaultID) internal {
        // MAI: withdraw camWMATIC
        // https://polygonscan.com/tx/0xfcd83b5c444e537b6f569dac7ae6dd82cb011d80cb00d790f2e1814c8175d437

        IERC20(d.lpToken).safeApprove(d.vault, 0);
        IERC20(d.lpToken).safeApprove(d.vault, amount);

        IErc20Stablecoin(d.vault).withdrawCollateral(_vaultID, amount);
    }

    function _maiWithdrawCollateral(uint256 amount) internal {
        _maiWithdrawCollateral(amount, _maiGetVaultID());
    }

    // from enter() https://github.com/0xlaozi/qidao/blob/d8ef82d461982f6c81f8e7ef76d7678a933760ba/contracts/camAave.sol#L87
    function _maiSourceToLPTokenAmount(uint256 sourceTokenAmount) public returns (uint256) {
        uint256 totalTokenLocked = IERC20(d.sourceToken).balanceOf(d.lpToken);
        uint256 totalShares = IERC20(d.lpToken).totalSupply(); // Gets the amount of camToken in existence

        uint16 depositFeeBP = ICamWMATIC(d.lpToken).depositFeeBP();

        uint256 lpTokenAmount;
        if (totalShares == 0 || totalTokenLocked == 0) {
            lpTokenAmount = sourceTokenAmount;
        } else {
            lpTokenAmount = sourceTokenAmount.mul(totalShares).div(totalTokenLocked);
        }

        if(depositFeeBP > 0) {
            uint256 depositFee = lpTokenAmount.mul(depositFeeBP).div(10000);
            return lpTokenAmount.sub(depositFee);
        } else {
           return lpTokenAmount;
        }
    }

    function _maiLPToSourceTokenAmount(uint256 lpTokenAmount) public view returns (uint256) {
        uint256 sourceTokenAmount = 0;

        if(lpTokenAmount>0) {
            uint256 totalShares = IERC20(d.lpToken).totalSupply(); // Gets the amount of camToken in existence
            sourceTokenAmount = lpTokenAmount.mul(IERC20(d.sourceToken).balanceOf(d.lpToken)).div(totalShares);
        }

        return sourceTokenAmount;
    }

    function _maiPercentageToBorrowTokenAmount(uint256 percentage) public view returns (uint256) {
        uint256 vaultID = _maiGetVaultID();
        IErc20Stablecoin stablecoin = IErc20Stablecoin(d.vault);

        uint256 collateral  = stablecoin.vaultCollateral(vaultID);
        uint256 maiDecimals = uint256(IERC20Metadata(stablecoin.mai()).decimals());
        uint256 collateralDecimals = uint256(IERC20Metadata(stablecoin.collateral()).decimals());
        uint256 collateralValue = collateral.mul(stablecoin.getEthPriceSource())
                    .mul(10**(maiDecimals.sub(collateralDecimals)));

        uint256 amount = collateralValue.div(stablecoin.getTokenPriceSource()).mul(percentage).div(100);

        return amount;
    }

    function _maiRebalance() internal {
        uint256 vaultID = _maiGetVaultID();
        IErc20Stablecoin stablecoin = IErc20Stablecoin(d.vault);

        //TODO when stablecoin.checkLiquidation? and call stablecoin.getPaid() when liquidated
        uint256 collateralPercentage = stablecoin.checkCollateralPercentage(vaultID);
        if (collateralPercentage==0) return; // no debt or collateral

        if (collateralPercentage<=d.minPercentage) {

            uint256 canBorrowTotal = _maiPercentageToBorrowTokenAmount(d.targetPercentage);
            uint256 debt = stablecoin.vaultDebt(vaultID);
            uint256 repay = debt.sub(canBorrowTotal);
            //TODO request from Balancer

            uint256 available = IERC20(d.lpToken).balanceOf(address(this));
            _maiRepayToken(Math.min(repay, available));

        } else if (collateralPercentage>=d.maxPercentage) {

            uint256 canBorrowTotal = _maiPercentageToBorrowTokenAmount(d.targetPercentage);
            uint256 debt = stablecoin.vaultDebt(vaultID);
            uint256 borrow = canBorrowTotal.sub(debt);
            _maiBorrowToken(borrow);
            //TODO deposit to Balancer

        }

    }

}
