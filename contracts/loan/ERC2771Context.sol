// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (metatx/ERC2771Context.sol)

pragma solidity ^0.8.1;

/**
 * @dev Context variant with ERC2771 support.
 */
// based on https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/metatx/ERC2771Context.sol
abstract contract ERC2771Context {

  // for whitelist new relayers need to add new constants and update proxies
  address private constant GELATO_RELAY_1_BALANCE_ERC_2771 = 0xd8253782c45a12053594b9deB72d8e8aB2Fca54c;
  address private constant SACRA_RELAY = 0x52CEba41Da235Af367bFC0b0cCd3314cb901bB5F;

  function isTrustedForwarder(address forwarder) public view virtual returns (bool){
    return forwarder == GELATO_RELAY_1_BALANCE_ERC_2771 || forwarder == SACRA_RELAY;
  }

  function _msgSender() internal view virtual returns (address sender) {
    if (isTrustedForwarder(msg.sender)) {
      // The assembly code is more direct than the Solidity version using `abi.decode`.
      /// @solidity memory-safe-assembly
      assembly {
        sender := shr(96, calldataload(sub(calldatasize(), 20)))
      }
      return sender;
    } else {
      return msg.sender;
    }
  }

  function _msgData() internal view virtual returns (bytes calldata) {
    if (isTrustedForwarder(msg.sender)) {
      return msg.data[: msg.data.length - 20];
    } else {
      return msg.data;
    }
  }

  /// @notice Return true if given address is not a smart contract but a wallet address.
  /// @dev It is not 100% guarantee after EIP-3074 implementation, use it as an additional check.
  /// @return true if the address is a wallet.
  function _isNotSmartContract() internal view returns (bool) {
    return isTrustedForwarder(msg.sender) || msg.sender == tx.origin;
  }
}
