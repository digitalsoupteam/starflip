// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IReferralProgram
 * @dev Interface for the ReferralProgram contract
 */
interface IReferralProgram {
    function referralsOf(address player) external view returns (address[] memory);

    function referrerOf(address player) external view returns (address);

    function rewards(address player, address token) external view returns (uint256);

    function claim(address _payToken, uint256 _payTokenAmount) external;

    function addReward(address player, uint256 tokenAmount, address tokenAddress) external payable;

    function setReferral(address player, address referrer) external;
}