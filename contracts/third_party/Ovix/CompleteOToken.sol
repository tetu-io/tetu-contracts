// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.8.4;

import "./OTokenStorage.sol";
import "./IOErc20.sol";

abstract contract CompleteOToken is OTokenStorage, IOErc20 {}
