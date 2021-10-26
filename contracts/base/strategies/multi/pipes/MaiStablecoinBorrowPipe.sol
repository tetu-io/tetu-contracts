// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./Pipe.sol";
import "./../../../../third_party/qudao-mai/IErc20Stablecoin.sol";

    struct MaiStablecoinBorrowPipeData {
        address stablecoin; //Erc20Stablecoin contract address
        uint256 vaultID;
        address borrowedToken; // mai (miMATIC) for example
        uint16 minPercentage;
        uint16 maxPercentage;
        uint16 targetPercentage;
    }

/// @title Wrapping Pipe Contract
/// @author bogdoslav
contract MaiStablecoinBorrowPipe is Pipe {
    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// @dev creates context
    function create(MaiStablecoinBorrowPipeData memory d) public pure returns (bytes memory) {
        return abi.encode(d.stablecoin, d.vaultID, d.borrowedToken); //TODO pack percentages
    }

    /// @dev decodes context
    /// @param c abi-encoded context
    function context(bytes memory c)
    internal pure returns (address sourceToken, address stablecoin, uint256 vaultID) {
        (sourceToken, stablecoin, vaultID) = abi.decode(c, (address, address, uint256));//TODO unpack percentages
    }

    /// @dev Borrow tokens
    /// @param c abi-encoded context
    /// @param amount in source units
    /// @return output in underlying units
    function _put(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (address borrowedToken, address stablecoin, uint256 vaultID) = context(c);
        uint256 before = IERC20(borrowedToken).balanceOf(address(this)); //TODO

        IErc20Stablecoin(stablecoin).borrowToken(vaultID, amount);

        uint256 current = IERC20(borrowedToken).balanceOf(address(this));
        output = current.sub(before);
    }

    /// @dev Repay borrowed tokens
    /// @param c abi-encoded context
    /// @param amount in underlying units
    /// @return output in source units
    function _get(bytes memory c, uint256 amount) override public returns (uint256 output) {
        (, address stablecoin, uint256 vaultID) = context(c);
        uint256 before = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);

        IErc20Stablecoin(stablecoin).payBackToken(vaultID, amount);

        uint256 current = IErc20Stablecoin(stablecoin).vaultDebt(vaultID);
        output = before.sub(current); // as it is debt, it is less after repay
    }

    /// @dev available ETH (MATIC) source balance
    /// @param c abi-encoded context
    /// @return balance in source units
    function _sourceBalance(bytes memory c) override public view returns (uint256) {
        (, address stablecoin, uint256 vaultID) = context(c);
        return IErc20Stablecoin(stablecoin).vaultDebt(vaultID);
    }

    /// @dev underlying balance (LP token)
    /// @param c abi-encoded context
    /// @return balance in underlying units
    function _underlyingBalance(bytes memory c) override public view returns (uint256) {
        (address borrowedToken,,) = context(c);
        return IERC20(borrowedToken).balanceOf(address(this));
    }

    /// @dev function for re balancing. When rebalance
    /// param c abi-encoded context
    /// @return imbalance in underlying units
    /// @return deficit - when true, then ask to receive underlying imbalance amount, when false - put imbalance to next pipe,
    function _rebalance(bytes memory) override public returns (uint256 imbalance, bool deficit) {
        // balanced, no deficit by default
        return (0,false); //TODO
    }

}
