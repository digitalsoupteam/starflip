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
 * @notice Contract for managing referrals and rewards in the platform
 * @dev Implements a referral system where players can refer others and earn rewards
 *      Uses ReentrancyGuard to prevent reentrancy attacks during reward claims
 */
contract ReferralProgram is
ReentrancyGuardUpgradeable,
UUPSUpgradeable,
IReferralProgram
{
    using SafeERC20 for IERC20;

    /// @notice Constant used as a divisor for percentage calculations (100% = 10000)
    uint256 public constant DIVIDER = 10000;

    /// @notice Mapping of referrer addresses to the addresses they have referred
    mapping(address => address[]) private _referralsOf;

    /// @notice Mapping of player addresses to their referrer's address
    mapping(address => address) private _referrerOf;

    /// @notice Mapping of player addresses to token addresses to reward amounts
    mapping(address => mapping(address => uint256)) private _rewards;

    /// @notice The percentage of bet amounts that referrers earn as rewards (in basis points, e.g., 500 = 5%)
    uint256 public referralPercent;

    /// @notice Reference to the address book contract that provides access to other contracts
    IAddressBook public addressBook;

    /**
     * @notice Emitted when a player claims their referral rewards
     * @param referrer The address of the player claiming the rewards
     * @param payToken The address of the token being claimed (address(0) for ETH)
     * @param payTokenAmount The amount of tokens being claimed
     */
    event Claim(
        address indexed referrer,
        address indexed payToken,
        uint256 payTokenAmount
    );

    /**
     * @notice Constructor that disables initializers
     * @dev Prevents the implementation contract from being initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Receive function to accept native token (ETH)
     * @dev Allows the contract to receive ETH directly
     */
    receive() external payable {}

    /**
     * @notice Initializes the contract with the address book reference and initial referral percentage
     * @dev Can only be called once due to the initializer modifier
     * @dev Initializes both ReentrancyGuard and UUPSUpgradeable
     * @param _addressBook Address of the address book contract
     * @param initialReferralPercent The initial referral percentage (in basis points, e.g., 500 = 5%)
     */
    function initialize(address _addressBook, uint256 initialReferralPercent) external initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        require(initialReferralPercent <= DIVIDER, "initialReferralPercent cannot exceed 100%");

        addressBook = IAddressBook(_addressBook);
        referralPercent = initialReferralPercent;

        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Sets up a referral relationship between a player and a referrer
     * @dev Creates a one-way referral link that cannot be changed later
     * @dev Adds the player to the referrer's list of referrals
     * @param player The address of the player being referred
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
     * @notice Returns the list of players referred by a specific player
     * @dev Implements the IReferralProgram interface
     * @param player The address of the player (referrer)
     * @return An array of addresses that were referred by the player
     */
    function referralsOf(address player) external view override returns (address[] memory) {
        return _referralsOf[player];
    }

    /**
     * @notice Returns the referrer of a specific player
     * @dev Implements the IReferralProgram interface
     * @param player The address of the player
     * @return The address of the player's referrer (address(0) if none)
     */
    function referrerOf(address player) external view override returns (address) {
        return _referrerOf[player];
    }

    /**
     * @notice Returns the amount of rewards a player has earned for a specific token
     * @dev Implements the IReferralProgram interface
     * @param player The address of the player (referrer)
     * @param token The address of the token (address(0) for ETH)
     * @return The amount of rewards available to claim
     */
    function rewards(address player, address token) external view override returns (uint256) {
        return _rewards[player][token];
    }

    /**
     * @notice Adds a reward for a player's referrer based on the player's bet amount
     * @dev Can only be called by registered games
     * @dev Calculates the reward amount based on the referral percentage
     * @dev If the player has no referrer, no reward is added
     * @param player The address of the player who made the bet
     * @param tokenAmount The amount of tokens bet by the player
     * @param tokenAddress The address of the token used for the bet (address(0) for ETH)
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
     * @notice Updates the referral percentage
     * @dev Only administrators can update the referral percentage
     * @dev The percentage is expressed in basis points (e.g., 500 = 5%)
     * @param percent The new referral percentage (cannot exceed DIVIDER)
     */
    function setReferralPercent(uint256 percent) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        require(percent <= DIVIDER, "ReferralProgram: percent cannot exceed 100%");
        referralPercent = percent;
    }

    /**
     * @notice Allows a player to claim their referral rewards
     * @dev Implements the IReferralProgram interface
     * @dev Uses nonReentrant modifier to prevent reentrancy attacks
     * @dev Checks that the system is not paused before allowing claims
     * @dev Emits a Claim event when rewards are successfully claimed
     * @param _payToken The address of the token to claim (address(0) for ETH)
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
     * @notice Withdraw funds (native or ERC20) from the contract to treasury
     * @dev Only administrators can withdraw funds
     * @dev For non-native tokens, verifies that the token is supported by the platform
     * @dev Checks that the contract has sufficient balance before withdrawing
     * @param _token The address of the token to withdraw (use address(0) for ETH)
     * @param _amount The amount to withdraw (must be greater than zero)
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
     * @notice Authorization function for contract upgrades
     * @dev Only the owners multisig can upgrade the contract
     * @param newImplementation Address of the new implementation (unused parameter required by UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }
}
