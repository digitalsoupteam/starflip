// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {IReferralProgram} from "../_interfaces/vaults/IReferralProgram.sol";
import {IAddressBook} from "../_interfaces/access/IAddressBook.sol";

/**
 * @title ReferralProgram
 * @dev Contract for managing referrals and rewards
 */
contract ReferralProgram is
ReentrancyGuardUpgradeable,
UUPSUpgradeable,
IReferralProgram
{
    using SafeERC20 for IERC20;

    uint256 public constant DIVIDER = 10000;

    mapping(address => address[]) private _referralsOf;
    mapping(address => address) private _referrerOf;
    mapping(address => mapping(address => uint256)) private _rewards;
    uint256 public referralPercent;
    IAddressBook public addressBook;

    event Claim(
        address indexed referrer,
        address indexed payToken,
        uint256 payTokenAmount
    );

    /**
     * @notice Constructor that disables initializers
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Receive function to accept native token
     */
    receive() external payable {}

    /**
     * @dev Initializes the contract
     * @param _addressBook The address book contract
     * @param initialReferralPercent The initial referral percentage
     */
    function initialize(address _addressBook, uint256 initialReferralPercent) external initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
        referralPercent = initialReferralPercent;

        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
    }

    /**
     * @dev Sets up a referral relationship
     * @param player The address of the player
     * @param referrer The address of the referrer
     */
    function setReferral(address player, address referrer) external {
        require(player != address(0), "ReferralProgram: player is the zero address");
        require(referrer != address(0), "ReferralProgram: referrer is the zero address");
        require(player != referrer, "ReferralProgram: player cannot refer themselves");
        require(_referrerOf[player] == address(0), "ReferralProgram: player already has a referrer");

        _referrerOf[player] = referrer;
        _referralsOf[referrer].push(player);
    }

    /**
     * @dev Returns the list of referrals for a player
     * @param player The address of the player
     * @return The list of referrals
     */
    function referralsOf(address player) external view override returns (address[] memory) {
        return _referralsOf[player];
    }

    /**
     * @dev Returns the referrer of a player
     * @param player The address of the player
     * @return The address of the referrer
     */
    function referrerOf(address player) external view override returns (address) {
        return _referrerOf[player];
    }

    /**
     * @dev Returns the rewards for a player
     * @param player The address of the player
     * @param token The address of the token
     * @return The amount of rewards
     */
    function rewards(address player, address token) external view override returns (uint256) {
        return _rewards[player][token];
    }

    /**
     * @dev Adds a reward for a player
     * @param player The address of the player
     * @param tokenAmount The amount of tokens to add as reward
     */
    function addReward(address player, uint256 tokenAmount, address tokenAddress) external payable {
        addressBook.pauseManager().requireNotPaused();
        require(addressBook.gameManager().isGameExist(msg.sender), 'only game!');
        address referrer = _referrerOf[player];
        uint256 rewardAmount = (tokenAmount * referralPercent) / DIVIDER;

        if (referrer != address(0)) {
            if (tokenAddress != address(0)) {
                _rewards[referrer][tokenAddress] += rewardAmount;
            } else {
                _rewards[referrer][address(0)] += rewardAmount;
            }
        }
    }

    /**
     * @dev Sets the referral percentage
     * @param percent The new referral percentage
     */
    function setReferralPercent(uint256 percent) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        require(percent <= DIVIDER, "ReferralProgram: percent cannot exceed 100%");
        referralPercent = percent;
    }

    /**
     * @dev Claims rewards for a specific token
     * @param _payToken The address of the token to claim
     * @param _payTokenAmount The amount of tokens to claim
     */
    function claim(address _payToken, uint256 _payTokenAmount) external override nonReentrant {
        addressBook.pauseManager().requireNotPaused();
        address player = msg.sender;
        require(_rewards[player][_payToken] >= _payTokenAmount, "ReferralProgram: insufficient rewards");
        require(_payTokenAmount > 0, "_amount is zero!");
        _rewards[player][_payToken] -= _payTokenAmount;

        if (_payToken == address(0)) {
            require(_payTokenAmount <= address(this).balance, "Insufficient contract balance");
            Address.sendValue(payable(player), _payTokenAmount);
        } else {
            IERC20 token = IERC20(_payToken);
            require(_payTokenAmount <= token.balanceOf(address(this)), "Insufficient token balance");
            token.safeTransfer(player, _payTokenAmount);
        }

        emit Claim(player, _payToken, _payTokenAmount);
    }

    /**
     * @notice Withdraw funds (native or ERC20) from the contract to treasury (administrators only)
     * @dev Allows the administrators to withdraw funds from the contract to treasury
     * @param _token The address of the token to withdraw (use address(0) for ETH)
     * @param _amount The amount to withdraw
     */
    function withdrawToTreasury(address _token, uint256 _amount) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        require(_amount > 0, "_amount is zero!");

        if (_token != address(0)) addressBook.tokensManager().requireTokenSupport(_token);

        if (_token == address(0)) {
            require(_amount <= address(this).balance, "Insufficient contract balance");
            Address.sendValue(payable(addressBook.treasury()), _amount);
        } else {
            IERC20 token = IERC20(_token);
            require(_amount <= token.balanceOf(address(this)), "Insufficient token balance");
            token.safeTransfer(addressBook.treasury(), _amount);
        }
    }

    /**
     * @dev Authorizes an upgrade to a new implementation
     * @param newImplementation The address of the new implementation
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }
}
