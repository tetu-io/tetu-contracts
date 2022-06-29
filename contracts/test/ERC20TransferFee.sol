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

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract ERC20TransferFee is ERC20PresetMinterPauser {
  bytes32 public constant COLLECTOR_ROLE = keccak256("COLLECTOR_ROLE");
  uint public constant FEE_RATE = 100; // 1% , 1000 = 0,1% ...

  constructor() ERC20PresetMinterPauser("Transfer Fee", "TRFEE")  {
    _setupRole(COLLECTOR_ROLE, _msgSender());
  }

  function _transferWithFee(address from, address recipient, uint amount) internal {
    uint fee = amount / FEE_RATE;
    _transfer(_msgSender(), recipient, amount - fee);
    address collector = getRoleMember(COLLECTOR_ROLE, 0);
    _transfer(_msgSender(),  collector, fee);
  }

  /**
   * @dev See {IERC20-transfer}.
   *
   * Requirements:
   *
   * - `recipient` cannot be the zero address.
   * - the caller must have a balance of at least `amount`.
   */
  function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
    _transferWithFee(_msgSender(), recipient, amount);
    return true;
  }

  /**
   * @dev See {IERC20-transferFrom}.
   *
   * Emits an {Approval} event indicating the updated allowance. This is not
   * required by the EIP. See the note at the beginning of {ERC20}.
   *
   * Requirements:
   *
   * - `sender` and `recipient` cannot be the zero address.
   * - `sender` must have a balance of at least `amount`.
   * - the caller must have allowance for ``sender``'s tokens of at least
   * `amount`.
   */
  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) public virtual override returns (bool result) {
    result = super.transferFrom(sender, recipient, amount);
    if (result) {
      uint fee = amount / FEE_RATE;
      address collector = getRoleMember(COLLECTOR_ROLE, 0);
      _transfer(recipient, collector, fee);
    }
  }


}
