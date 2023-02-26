// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

contract WTETU {
  string public name = "Wrapped TETU";
  string public symbol = "WTETU";
  uint8  public decimals = 18;

  event  Approval(address indexed src, address indexed guy, uint wad);
  event  Transfer(address indexed src, address indexed dst, uint wad);
  event  Deposit(address indexed dst, uint wad);
  event  Withdrawal(address indexed src, uint wad);

  mapping(address => uint) public balanceOf;
  mapping(address => mapping(address => uint)) public allowance;

  receive() external payable {
    deposit();
  }

  function deposit() public payable {
    require(msg.value > 0, "Zero deposit WTETU");
    balanceOf[msg.sender] += msg.value;
    emit Deposit(msg.sender, msg.value);
  }

  function withdraw(uint wad) public {
    require(balanceOf[msg.sender] >= wad, "Not enough WTETU");
    balanceOf[msg.sender] -= wad;
    payable(msg.sender).transfer(wad);
    emit Withdrawal(msg.sender, wad);
  }

  function totalSupply() public view returns (uint) {
    return address(this).balance;
  }

  function approve(address guy, uint wad) public returns (bool) {
    allowance[msg.sender][guy] = wad;
    emit Approval(msg.sender, guy, wad);
    return true;
  }

  function transfer(address dst, uint wad) public returns (bool) {
    return transferFrom(msg.sender, dst, wad);
  }

  function transferFrom(address src, address dst, uint wad)
  public
  returns (bool)
  {
    require(balanceOf[src] >= wad, "Not enough WTETU");

    if (src != msg.sender && allowance[src][msg.sender] != type(uint).max) {
      require(allowance[src][msg.sender] >= wad, "Not enough approve for WTETU");
      allowance[src][msg.sender] -= wad;
    }

    balanceOf[src] -= wad;
    balanceOf[dst] += wad;

    emit Transfer(src, dst, wad);

    return true;
  }
}
