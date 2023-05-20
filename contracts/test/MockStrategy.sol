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
import "../openzeppelin/IERC20.sol";
import "../openzeppelin/IERC20Metadata.sol";
import "hardhat/console.sol";

contract MockStrategy {

  address public underlying;
  bool internal _isController = true;

  function isController(address) external view returns (bool) {
    return _isController;
  }

  function setUnderlying(address underlying_) external {
    underlying = underlying_;
  }

  //region --------------------------------- investedUnderlyingBalance
  uint private _investedUnderlyingBalance;
  function setInvestedUnderlyingBalance(uint balance) external {
    _investedUnderlyingBalance = balance;
  }

  function investedUnderlyingBalance() external view returns (uint256) {
    return _investedUnderlyingBalance;
  }
  //endregion --------------------------------- investedUnderlyingBalance

  //region --------------------------------- withdrawAllToVault
  struct WithdrawAllToVaultParams {
    address vault;
    uint amount;
  }
  WithdrawAllToVaultParams private _withdrawAllToVaultParams;
  function setWithdrawAllToVault(address vault_, uint amount_) external {
    _withdrawAllToVaultParams = WithdrawAllToVaultParams({
      vault: vault_,
      amount: amount_
    });
  }

  function withdrawAllToVault() external {
    require(IERC20Metadata(underlying).balanceOf(address(this)) >= _withdrawAllToVaultParams.amount, "MockStrategy.withdrawAllToVault");
    console.log("Withdraw all to vault:", _withdrawAllToVaultParams.amount);
    IERC20(underlying).transfer(_withdrawAllToVaultParams.vault, _withdrawAllToVaultParams.amount);
  }
  //endregion --------------------------------- withdrawAllToVault

  //region --------------------------------- withdrawToVault
  struct WithdrawToVaultParams {
    address vault;
  }
  WithdrawToVaultParams private _withdrawToVaultParams;
  function setWithdrawToVault(address vault_) external {
    _withdrawToVaultParams = WithdrawToVaultParams({
      vault: vault_
    });
  }
  function withdrawToVault(uint256 amount_) external {
    require(IERC20Metadata(underlying).balanceOf(address(this)) >= amount_, "MockStrategy.withdrawToVault");
    console.log("Withdraw to vault:", amount_);
    IERC20(underlying).transfer(_withdrawToVaultParams.vault, amount_);
  }
  //endregion --------------------------------- withdrawToVault
}
