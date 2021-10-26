// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./Pipe.sol";
import "./../../../../third_party/qudao-mai/IErc20Stablecoin.sol";

struct MaiStablecoinCollateralPipeData {
    address sourceToken;
    address stablecoin; //Erc20Stablecoin contract address
    uint256 vaultID;
}

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract MaiStablecoinCollateralPipe is Pipe {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// @dev creates context
    function create(MaiStablecoinCollateralPipeData memory d) public pure returns (bytes memory) {
        return abi.encode(d.sourceToken, d.stablecoin, d.vaultID);
    }

    /// @dev decodes context
    /// @param c abi-encoded context
    function context(bytes memory c)
    internal pure returns (address sourceToken, address stablecoin, uint256 vaultID) {
        (sourceToken, stablecoin, vaultID) = abi.decode(c, (address, address, uint256));
    }

    /// @dev create new vault
    function createNewVault(address stablecoin)
    public returns (uint256 vaultIndex, uint256 vaultID) {
        vaultIndex = IErc20Stablecoin(stablecoin).createVault();
        vaultID = ERC721Enumerable(stablecoin).tokenOfOwnerByIndex(address(this), vaultIndex);
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param c abi-encoded context
    /// @param amount in source units
    /// @return output in underlying units
    function _put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address sourceToken, address stablecoin, uint256 vaultID) = context(c);
        uint256 before = IErc20Stablecoin(stablecoin).vaultCollateral(vaultID);

        IERC20(sourceToken).safeApprove(stablecoin, 0);
        IERC20(sourceToken).safeApprove(stablecoin, amount);
        IErc20Stablecoin(stablecoin).depositCollateral(vaultID, amount);

        uint256 current = IErc20Stablecoin(stablecoin).vaultCollateral(vaultID);
        output = current.sub(before);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param c abi-encoded context
    /// @param amount in underlying units
    /// @return output in source units
    function _get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address sourceToken, address stablecoin, uint256 vaultID) = context(c);
        uint256 before = IERC20(sourceToken).balanceOf(address(this));

        IErc20Stablecoin(stablecoin).withdrawCollateral(vaultID, amount);

        uint256 current = IERC20(sourceToken).balanceOf(address(this));
        output = current.sub(before);
    }

    /// @dev available ETH (MATIC) source balance
    /// @param c abi-encoded context
    /// @return balance in source units
    function _sourceBalance(bytes memory c) override public view returns (uint256) {
        (address sourceToken,,) = context(c);
        return IERC20(sourceToken).balanceOf(address(this));
    }

    /// @dev underlying balance (LP token)
    /// @param c abi-encoded context
    /// @return balance in underlying units
    function _underlyingBalance(bytes memory c) override public view returns (uint256) {
        (, address stablecoin, uint256 vaultID) = context(c);
        return IErc20Stablecoin(stablecoin).vaultCollateral(vaultID);
    }

}
