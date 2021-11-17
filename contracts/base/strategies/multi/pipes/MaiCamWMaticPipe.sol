// SPDX-License-Identifier: ISC
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Pipe.sol";
import "./../../../../third_party/qudao-mai/ICamWMATIC.sol";

import "hardhat/console.sol";

struct MaiCamWMaticPipeData {
    address sourceToken;
    address lpToken;
    address rewardToken;
}

/// @title Mai CamWMatic Pipe Contract
/// @author bogdoslav
contract MaiCamWMaticPipe is Pipe {
    using SafeERC20 for IERC20;

    MaiCamWMaticPipeData public d;

    /// @dev creates context
    constructor(MaiCamWMaticPipeData memory _d) Pipe() {
        name = 'MaiCamWMaticPipe';
        d = _d;
        sourceToken = _d.sourceToken;
        outputToken = _d.lpToken;
        rewardToken = _d.rewardToken;
    }

    /// @dev function for investing, deposits, entering, borrowing
    /// @param amount in source units
    /// @return output in underlying units
    function put(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('MaiCamWMaticPipe put amount', amount);
        ERC20Approve(sourceToken, d.lpToken, amount);
        ICamWMATIC(outputToken).enter(amount);

        output = ERC20Balance(outputToken);
        transferERC20toNextPipe(outputToken, output);
    }

    /// @dev function for de-vesting, withdrawals, leaves, paybacks
    /// @param amount in underlying units
    /// @return output in source units
    function get(uint256 amount) override onlyPipeline public returns (uint256 output) {
        console.log('MaiCamWMaticPipe get amount', amount);
        ICamWMATIC(d.lpToken).leave(amount);

        output = ERC20Balance(sourceToken);
        transferERC20toPrevPipe(sourceToken, output);
    }

}
