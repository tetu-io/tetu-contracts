// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.8.0;

interface IMerkleOrchard {
    struct Claim {
        uint256 distribution;
        uint256 balance;
        address distributor;
        uint256 tokenIndex;
        bytes32[] merkleProof;
    }

    function getVault() external view returns (address);

    function getDistributionRoot(
        address token,
        address distributor,
        uint256 distribution
    ) external view returns (bytes32);

    function getSuppliedBalance(address token, address distributor)
    external view returns (uint256);

    function isClaimed(
        address token,
        address distributor,
        uint256 distribution,
        address claimer
    ) external view returns (bool);

    function claimStatus(
        address token,
        address distributor,
        address claimer,
        uint256 begin,
        uint256 end
    ) external view returns (bool[] memory);

    function merkleRoots(
        address token,
        address distributor,
        uint256 begin,
        uint256 end
    ) external view returns (bytes32[] memory);

    function verifyClaim(
        address token,
        address distributor,
        uint256 distribution,
        address claimer,
        uint256 claimedBalance,
        bytes32[] memory merkleProof
    ) external view returns (bool);

    // Claim functions

    /**
     * @notice Allows a user to claim multiple distributions
     */
    function claimDistributions(
        address claimer,
        Claim[] memory claims,
        address[] memory tokens
    ) external;

    /**
     * @notice Allows a user to claim multiple distributions to internal balance
     */
    function claimDistributionsToInternalBalance(
        address claimer,
        Claim[] memory claims,
        address[] memory tokens
    ) external;

    /**
     * @notice Allows a user to claim several distributions to a callback
     */
    function claimDistributionsWithCallback(
        address claimer,
        Claim[] memory claims,
        address[] memory tokens,
//        IDistributorCallback callbackContract,
        address callbackContract,
        bytes calldata callbackData
    ) external;

    /**
     * @notice
     * Allows a distributor to add funds to the contract as a merkle tree, These tokens will
     * be withdrawn from the sender
     * These will be pulled from the user
     */
    function createDistribution(
        address token,
        uint256 distribution,
        bytes32 merkleRoot,
        uint256 amount
    ) external;

}
