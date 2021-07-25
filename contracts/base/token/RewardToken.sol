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

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @title TETU token contract. Has strict weekly emission algorithm
/// @dev Use with TetuProxy
/// @author belbix
contract RewardToken is ERC20Burnable, ERC20Capped {
  using SafeMath for uint256;

  uint256 internal constant SCALE = 1e18;
  uint256 internal constant HALF_SCALE = 5e17;
  address public immutable owner;

  uint256 public constant HARD_CAP = 1 * (10 ** 9) * SCALE; // 1 billion
  uint256 public constant MINTING_PERIOD = 126227808; // 4 years

  uint256 public mintingStartTs;
  uint256 public mintingEndTs;

  constructor(address _owner)
  ERC20("TETU Reward Token", "TETU")
  ERC20Capped(HARD_CAP) {
    owner = _owner;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "not owner");
    _;
  }

  function startMinting() external onlyOwner {
    require(mintingStartTs == 0, "minting already started");
    mintingStartTs = block.timestamp;
    mintingEndTs = mintingStartTs.add(MINTING_PERIOD);
  }

  function mint(address to, uint256 amount) external onlyOwner {
    _mint(to, amount);
  }

  function _mint(address account, uint256 amount) internal override(ERC20, ERC20Capped) {
    super._mint(account, amount);
  }

  function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
    if (from == address(0)) {// it is mint
      require(mintingStartTs != 0, "minting not started");
      require(totalSupply().add(amount) <= maxTotalSupplyForCurrentBlock(), "limit exceeded");
    }
    super._beforeTokenTransfer(from, to, amount);
  }

  function currentWeek() public view returns (uint256){
    if (mintingStartTs == 0) {// not started yet
      return 0;
    }
    return block.timestamp.sub(mintingStartTs).div(1 weeks).add(1);
  }

  function maxTotalSupplyForCurrentBlock() public view returns (uint256){
    uint256 allWeeks = MINTING_PERIOD / 1 weeks;

    uint256 week = Math.min(allWeeks, currentWeek());

    if (week == 0) {
      return 0;
    }
    if (week >= MINTING_PERIOD / 1 weeks) {
      return HARD_CAP;
    }

    uint256 finalMultiplier = _log2(allWeeks.add(1).mul(SCALE));

    uint256 baseWeekEmission = HARD_CAP / finalMultiplier;

    uint256 multiplier = _log2(week.add(1).mul(SCALE));

    uint256 maxTotalSupply = baseWeekEmission.mul(multiplier);

    return Math.min(maxTotalSupply, HARD_CAP);
  }

  /*********************************************
  *              PRB-MATH                      *
  *   https://github.com/hifi-finance/prb-math *
  **********************************************/

  /// @notice Calculates the binary logarithm of x.
  ///
  /// @dev Based on the iterative approximation algorithm.
  /// https://en.wikipedia.org/wiki/Binary_logarithm#Iterative_approximation
  ///
  /// Requirements:
  /// - x must be greater than or equal to SCALE, otherwise the result would be negative.
  ///
  /// Caveats:
  /// - The results are nor perfectly accurate to the last decimal,
  ///   due to the lossy precision of the iterative approximation.
  ///
  /// @param x The unsigned 60.18-decimal fixed-point number for which
  ///           to calculate the binary logarithm.
  /// @return result The binary logarithm as an unsigned 60.18-decimal fixed-point number.
  function _log2(uint256 x) public pure returns (uint256 result) {
    require(x >= SCALE, "log input should be greater 1e18");

    // Calculate the integer part of the logarithm
    // and add it to the result and finally calculate y = x * 2^(-n).
    uint256 n = mostSignificantBit(x / SCALE);

    // The integer part of the logarithm as an unsigned 60.18-decimal fixed-point number.
    // The operation can't overflow because n is maximum 255 and SCALE is 1e18.
    uint256 rValue = n * SCALE;

    // This is y = x * 2^(-n).
    uint256 y = x >> n;

    // If y = 1, the fractional part is zero.
    if (y == SCALE) {
      return rValue;
    }

    // Calculate the fractional part via the iterative approximation.
    // The "delta >>= 1" part is equivalent to "delta /= 2", but shifting bits is faster.
    for (uint256 delta = HALF_SCALE; delta > 0; delta >>= 1) {
      y = (y * y) / SCALE;

      // Is y^2 > 2 and so in the range [2,4)?
      if (y >= 2 * SCALE) {
        // Add the 2^(-m) factor to the logarithm.
        rValue += delta;

        // Corresponds to z/2 on Wikipedia.
        y >>= 1;
      }
    }
    return rValue;
  }

  /// @notice Finds the zero-based index of the first one in the binary representation of x.
  /// @dev See the note on msb in the "Find First Set"
  ///      Wikipedia article https://en.wikipedia.org/wiki/Find_first_set
  /// @param x The uint256 number for which to find the index of the most significant bit.
  /// @return msb The index of the most significant bit as an uint256.
  //noinspection NoReturn
  function mostSignificantBit(uint256 x) internal pure returns (uint256 msb) {
    if (x >= 2 ** 128) {
      x >>= 128;
      msb += 128;
    }
    if (x >= 2 ** 64) {
      x >>= 64;
      msb += 64;
    }
    if (x >= 2 ** 32) {
      x >>= 32;
      msb += 32;
    }
    if (x >= 2 ** 16) {
      x >>= 16;
      msb += 16;
    }
    if (x >= 2 ** 8) {
      x >>= 8;
      msb += 8;
    }
    if (x >= 2 ** 4) {
      x >>= 4;
      msb += 4;
    }
    if (x >= 2 ** 2) {
      x >>= 2;
      msb += 2;
    }
    if (x >= 2 ** 1) {
      // No need to shift x any more.
      msb += 1;
    }
  }

}
