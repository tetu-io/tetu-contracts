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
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../base/governance/Controllable.sol";
import "../base/interface/ISmartVault.sol";
import "../base/interface/IStrategy.sol";
import "../base/interface/IController.sol";
import "../third_party/uniswap/IUniswapV2Pair.sol";
import "../third_party/uniswap/IUniswapV2Router02.sol";
import "./IPriceCalculator.sol";
import "hardhat/console.sol";
import "./IMultiSwap.sol";

/// @title A middle layer solution for creating Liquidity Pool Pair from given tokens
///        and deposit it into Tetu vault
/// @dev Use with ProxyGov
/// @author belbix
contract ZapIntoVault is Controllable {
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  bytes32 internal constant _MULTI_SWAP_SLOT = 0x268C7387BB3D6C63B06B7390ECC1422F60B0BA31459D23A25507C9F998F216E3;

  event UpdateMultiSwap(address oldValue, address newValue);

  constructor() {
    assert(_MULTI_SWAP_SLOT == bytes32(uint256(keccak256("eip1967.multiSwap")) - 1));
  }

  function initialize(address _controller) external initializer {
    Controllable.initializeControllable(_controller);
  }

  // ******************* VIEWS *****************************

  /// @dev Return address of MultiSwap contract
  function multiSwap() public view returns (IMultiSwap) {
    bytes32 slot = _MULTI_SWAP_SLOT;
    address adr;
    assembly {
      adr := sload(slot)
    }
    return IMultiSwap(adr);
  }

  // ******************** USERS ACTIONS *********************

  /// @dev Approval for token is assumed.
  ///      Convert given token to LP token
  ///      Token should be a keyToken from priceCalculator
  ///      Add liquidity to underlying LP of given vault
  function zapIntoLp(address _vault, address _token, uint256 _tokenAmount) external {
    address lp = ISmartVault(_vault).underlying();
    address[] memory assets = IStrategy(ISmartVault(_vault).strategy()).assets();
    require(assets.length == 2, "not lp underlying");

  }

  // ************************* GOV ACTIONS *******************

  /// @dev Set MultiSwap contract address
  function setMultiSwap(address _newValue) external onlyControllerOrGovernance {
    require(_newValue != address(0), "zero address");
    emit UpdateMultiSwap(address(multiSwap()), _newValue);
    bytes32 slot = _MULTI_SWAP_SLOT;
    assembly {
      sstore(slot, _newValue)
    }
  }

}
