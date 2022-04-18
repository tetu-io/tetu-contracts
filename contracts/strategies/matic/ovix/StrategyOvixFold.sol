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

import "../../../base/strategies/ovix/OvixFoldStrategyBase.sol";

contract StrategyOvixFold is OvixFoldStrategyBase {
    // OVIX CONTROLLER
    address private constant _OVIX_CONTROLLER = address(0x8849f1a0cB6b5D6076aB150546EddEe193754F1C);
    IStrategy.Platform private constant _PLATFORM = IStrategy.Platform.OVIX_LEND;
    // rewards
    address private constant OVIX = address(0x4A81f8796e0c6Ad4877A51C86693B0dE8093F2ef); // not correct address

    /// @dev OVIX oToken address for reward price determination
    IOToken public constant _O_USDC = IOToken(0xEBb865Bf286e6eA8aBf5ac97e1b56A76530F3fBe);
    address public constant _W_MATIC = 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270;
    address public constant _O_MATIC = 0xE554E874c9c60E45F1Debd479389C76230ae25A8;
    address[] private _poolRewards = [OVIX];
    address[] private _assets;

    constructor(
        address _controller,
        address _vault,
        address _underlying,
        address _oToken,
        uint256 _borrowTargetFactorNumerator,
        uint256 _collateralFactorNumerator
    )
        OvixFoldStrategyBase(
            _controller,
            _underlying,
            _vault,
            _poolRewards,
            _oToken,
            _W_MATIC,
            _O_MATIC,
            _OVIX_CONTROLLER,
            _O_USDC,
            _borrowTargetFactorNumerator,
            _collateralFactorNumerator
        )
    {
        require(_underlying != address(0), "zero underlying");
        _assets.push(_underlying);
    }

    function platform() external pure override returns (IStrategy.Platform) {
        return _PLATFORM;
    }

    // assets should reflect underlying tokens need to investing
    function assets() external view override returns (address[] memory) {
        return _assets;
    }
}
