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
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
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
    }

    using SafeERC20 for IERC20;

    MaiData private d;

    constructor(
        MaiData memory _maiData
    ) {
        d = _maiData;
    }

    function _maiCreateVault() internal {
        //TODO try catch with gas limit
        IErc20Stablecoin(d.vault).createVault();
    }

    function _maiGetVaultID(uint256 index) public view returns (uint256) {
        return ERC721Enumerable(d.vault).tokenOfOwnerByIndex(address(this), index);
    }

    function _maiGetVaultID() public view returns (uint256) {
        return _maiGetVaultID(0);
    }

    function _maiEnterCamWMatic(uint256 amount) internal {
        IERC20(d.sourceToken).safeApprove(d.lpToken, 0);
        IERC20(d.sourceToken).safeApprove(d.lpToken, amount);
        //TODO try catch with gas limit
        ICamWMATIC(d.lpToken).enter(amount);
    }

    function _maiLeaveCamWMatic(uint256 amount) internal {
        //TODO try catch with gas limit
        ICamWMATIC(d.lpToken).leave(amount);
    }

    function _maiDepositCollateral(uint256 amount, uint256 _vaultID) internal {
        IERC20(d.lpToken).safeApprove(d.vault, 0);
        IERC20(d.lpToken).safeApprove(d.vault, amount);
        //TODO try catch with gas limit
        IErc20Stablecoin(d.vault).depositCollateral(_vaultID, amount);
    }

    function _maiDepositCollateral(uint256 amount) internal {
        _maiDepositCollateral(amount, _maiGetVaultID());
    }

    function _maiBorrowToken(uint256 amount, uint256 _vaultID) internal {
        //TODO try catch with gas limit
        IErc20Stablecoin(d.vault).borrowToken(_vaultID, amount);
    }

    function _maiBorrowToken(uint256 amount) internal {
        _maiBorrowToken(amount,  _maiGetVaultID());
    }


    function _maiRepayToken(uint256 amount, uint256 _vaultID) internal {
        //TODO try catch with gas limit
        IErc20Stablecoin(d.vault).payBackToken(_vaultID, amount);
    }

    function _maiRepayToken(uint256 amount) internal {
        _maiRepayToken(amount,  _maiGetVaultID());
    }


    function _maiWithdrawCollateral(uint256 amount, uint256 _vaultID) internal {
        IERC20(d.lpToken).safeApprove(d.vault, 0);
        IERC20(d.lpToken).safeApprove(d.vault, amount);
        //TODO try catch with gas limit
        IErc20Stablecoin(d.vault).withdrawCollateral(_vaultID, amount);
    }

    function _maiWithdrawCollateral(uint256 amount) internal {
        _maiWithdrawCollateral(amount, _maiGetVaultID());
    }

}
