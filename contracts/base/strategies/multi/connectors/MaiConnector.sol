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
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./../../../../third_party/qudao-mai/ICamWMATIC.sol";
import "./../../../../third_party/qudao-mai/IErc20StableCoin.sol";

contract MaiConnector {
    using SafeERC20 for IERC20;

    address private erc20StableCoin;
    address private sourceTokenAddress;
    address private camWMaticPoolAddress;
    uint256 private vaultID = 0;
    address private maiBorrowTokenAddress;

    constructor(
        address _erc20StableCoin,
        address _sourceTokenAddress,
        address _camWMaticPoolAddress,
        address _maiBorrowTokenAddress
    ) public {
        erc20StableCoin = _erc20StableCoin;
        sourceTokenAddress = _sourceTokenAddress;
        camWMaticPoolAddress = _camWMaticPoolAddress;
        maiBorrowTokenAddress = _maiBorrowTokenAddress;
    }

    function _maiCreateVault() internal {
        //TODO try catch with gas limit
        IErc20Stablecoin(erc20StableCoin).createVault(); //TODO add try w gas limit
    }

    function _maiGetVaultID(uint256 index) public view returns (uint256) {
        return IErc20Stablecoin(erc20StableCoin).tokenOfOwnerByIndex(address(this), index);
    }

    function _maiGetVaultID() {
        if (vaultID==0) {
          vaultID = _maiGetVaultID(0);
        }
        return vaultID;
    }

    function _maiEnterCamWMatic(uint256 amount) internal {
        IERC20(sourceTokenAddress).safeApprove(camWMaticPoolAddress, 0);
        IERC20(sourceTokenAddress).safeApprove(camWMaticPoolAddress, amount);
        //TODO try catch with gas limit
        ICamWMATIC(camWMaticPoolAddress).enter(amount);
    }

    function _maiLeaveCamWMatic(uint256 amount) internal {
        //TODO try catch with gas limit
        ICamWMATIC(camWMaticPoolAddress).leave(amount);
    }

    function _maiDepositCollateral(uint256 amount, uint256 vaultID) internal {
        IERC20(camWMaticPoolAddress).safeApprove(erc20StableCoin, 0);
        IERC20(camWMaticPoolAddress).safeApprove(erc20StableCoin, amount);
        //TODO try catch with gas limit
        IErc20Stablecoin(erc20StableCoin).depositCollateral(vaultID, amount);
    }

    function _maiDepositCollateral(uint256 amount) internal {
        _maiDepositCollateral(amount, _maiGetVaultID());
    }

    function _maiBorrowToken(uint256 amount, uint256 vaultID) internal {
        //TODO try catch with gas limit
        IErc20Stablecoin(erc20StableCoin).borrowToken(vaultID, amount);
    }

    function _maiBorrowToken(uint256 amount) internal {
        _maiBorrowToken(amount,  _maiGetVaultID());
    }


    function _maiRepayToken(uint256 amount, uint256 vaultID) internal {
        //TODO try catch with gas limit
        IErc20Stablecoin(erc20StableCoin).payBackToken(vaultID, amount);
    }

    function _maiRepayToken(uint256 amount) internal {
        _maiRepayToken(amount,  _maiGetVaultID());
    }


    function _maiWithdrawCollateral(uint256 amount, uint256 vaultID) internal {
        IERC20(camWMaticPoolAddress).safeApprove(erc20StableCoin, 0);
        IERC20(camWMaticPoolAddress).safeApprove(erc20StableCoin, amount);
        //TODO try catch with gas limit
        IErc20Stablecoin(erc20StableCoin).withdrawCollateral(vaultID, amount);
    }

    function _maiWithdrawCollateral(uint256 amount) internal {
        _maiWithdrawCollateral(amount, _maiGetVaultID());
    }

}
