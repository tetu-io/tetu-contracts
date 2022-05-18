// SPDX-License-Identifier: ISC

pragma solidity 0.8.4;

interface IPoolVoting {
    function poolRanking(uint256) external view returns (address);

    function userVotingPoolAddress(address, uint256)
        external
        view
        returns (address);

    function userLastIndex0(address, address) external view returns (uint256);

    function epochVoted(
        address,
        uint256,
        address
    ) external view returns (bool);

    function MAX_VOTING_POOL_COUNT() external view returns (uint256);

    function boostingPowerMESH_A() external view returns (uint256);

    function poolRankingExist(address) external view returns (bool);

    function marketIndex1(address) external view returns (uint256);

    function boostingPowerMESH_B() external view returns (uint256);

    function validPoolOperator() external view returns (address);

    function governance() external view returns (address);

    function implementation() external view returns (address);

    function boostingAmount(address) external view returns (uint256);

    function prevBoostingAmount(uint256, address)
        external
        view
        returns (uint256);

    function boostingPowerA_B() external view returns (uint256);

    function prevPoolAmount(uint256, address) external view returns (uint256);

    function isBoostingToken(address) external view returns (bool);

    function marketIndex0(address) external view returns (uint256);

    function boostingPowerA_A() external view returns (uint256);

    function prevTotalAmount(uint256) external view returns (uint256);

    function entered() external view returns (bool);

    function poolAmount(address) external view returns (uint256);

    function _setImplementation(address _newImp) external;

    function userLastIndex1(address, address) external view returns (uint256);

    function isValidToken(address) external view returns (bool);

    function userVotingPoolAmount(address, uint256)
        external
        view
        returns (uint256);

    function userRewardSum1(address, address) external view returns (uint256);

    function userVotingPoolCount(address) external view returns (uint256);

    function poolCount() external view returns (uint256);

    function userRewardSum0(address, address) external view returns (uint256);

    function totalVotingAmount() external view returns (uint256);

    event AddVoting(address user, address exchange, uint256 amount);
    event RemoveVoting(address user, address exchange, uint256 amount);
    event PoolVotingStat(
        address exchange,
        uint256 epoch,
        uint256 boostingPower,
        uint256 poolAmount
    );
    event UpdateMarketIndex(
        address exchange,
        address token,
        uint256 amount,
        uint256 lastMined,
        uint256 miningIndex
    );
    event GiveReward(
        address user,
        address exchange,
        address token,
        uint256 amount,
        uint256 lastIndex,
        uint256 rewardSum
    );
    event SetValidToken(address token, bool valid);
    event SetBoostingToken(address token, bool valid);
    event SetBoostingPower(
        uint256 MESH_A,
        uint256 A_A,
        uint256 MESH_B,
        uint256 A_B
    );

    function version() external pure returns (string memory);

    function setValidPoolOperator(address _validPoolOperator) external;

    function delisting(address token) external;

    function setValidToken(address token, bool valid) external;

    function setBoostingToken(address token, bool valid) external;

    function setBoostingPower(
        uint256 _bpMESH_A,
        uint256 _bpA_A,
        uint256 _bpMESH_B,
        uint256 _bpA_B
    ) external;

    function getPoolBoosting(address pool)
        external
        view
        returns (uint256 boostingPower);

    function getPoolVotingMining(
        address pool,
        uint256 epoch,
        uint256 rate
    ) external view returns (uint256);

    function writePoolVotingStatList(address[] memory pools) external;

    function writePoolVotingStatRange(uint256 si, uint256 ei) external;

    function addVoting(address exchange, uint256 amount) external;

    function removeVoting(address exchange, uint256 amount) external;

    function removeAllVoting() external;

    function removeAllVoting(address user, bool force) external;

    function marketUpdate0(uint256 amount) external;

    function marketUpdate1(uint256 amount) external;

    function claimReward(address exchange) external;

    function claimRewardAll() external;
}
