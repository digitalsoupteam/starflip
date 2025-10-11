// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import {IAccessRoles} from "../_interfaces/access/IAccessRoles.sol";
import {IAddressBook} from "../_interfaces/access/IAddressBook.sol";
import {IGameManager} from "../_interfaces/games/IGameManager.sol";
import {IPauseManager} from "../_interfaces/access/IPauseManager.sol";
import {ITokensManager} from "../_interfaces/tokens/ITokensManager.sol";
import {IReferralProgram} from "../_interfaces/vaults/IReferralProgram.sol";

/**
 * @title AddressBook
 * @notice Contract that serves as a central registry for all important contract addresses in the system
 * @dev This contract allows the system to maintain references to all core components
 *      and provides a single source of truth for contract addresses
 */
contract AddressBook is IAddressBook, UUPSUpgradeable {
    /// @notice Reference to the access control contract that manages roles and permissions
    IAccessRoles public accessRoles;

    /// @notice Reference to the game manager contract that coordinates game operations
    IGameManager public gameManager;

    /// @notice Reference to the pause manager contract that controls system pause functionality
    IPauseManager public pauseManager;

    /// @notice Address of the treasury that receives fees and other platform revenues
    address public treasury;

    /// @notice Reference to the tokens manager contract that handles token operations
    ITokensManager public tokensManager;

    /// @notice Reference to the referral program contract that manages referral rewards
    IReferralProgram public referralProgram;

    /**
     * @notice Constructor that disables initializers
     * @dev Prevents the implementation contract from being initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract with the access roles contract address
     * @dev Can only be called once due to the initializer modifier
     * @param _accessRoles Address of the access roles contract
     */
    function initialize(address _accessRoles) external initializer {
        require(_accessRoles != address(0), "_accessRoles is zero!");
        accessRoles = IAccessRoles(_accessRoles);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Sets the game manager contract address during initial setup
     * @dev Can only be called by the deployer and only if the game manager hasn't been set yet
     * @param _gameManager Address of the game manager contract
     */
    function initialSetGameManager(address _gameManager) external {
        accessRoles.requireDeployer(msg.sender);
        require(_gameManager != address(0), "_gameManager is zero!");
        require(address(gameManager) == address(0), "gameManager contract exists!");
        gameManager = IGameManager(_gameManager);
    }

    /**
     * @notice Sets the pause manager contract address during initial setup
     * @dev Can only be called by the deployer and only if the pause manager hasn't been set yet
     * @param _pauseManager Address of the pause manager contract
     */
    function initialSetPauseManager(address _pauseManager) external {
        accessRoles.requireDeployer(msg.sender);
        require(_pauseManager != address(0), "_pause is zero!");
        require(address(pauseManager) == address(0), "pauseManager contract exists!");
        pauseManager = IPauseManager(_pauseManager);
    }

    /**
     * @notice Sets the treasury address during initial setup
     * @dev Can only be called by the deployer and only if the treasury hasn't been set yet
     * @param _treasury Address of the treasury
     */
    function initialSetTreasury(address _treasury) external {
        accessRoles.requireDeployer(msg.sender);
        require(_treasury != address(0), "_treasury is zero!");
        require(treasury == address(0), "treasury contract exists!");
        treasury = _treasury;
    }

    /**
     * @notice Sets the tokens manager contract address during initial setup
     * @dev Can only be called by the deployer and only if the tokens manager hasn't been set yet
     * @param _tokensManager Address of the tokens manager contract
     */
    function initialSetTokensManager(address _tokensManager) external {
        accessRoles.requireDeployer(msg.sender);
        require(_tokensManager != address(0), "_tokensManager is zero!");
        require(address(tokensManager) == address(0), "tokensManager contract exists!");
        tokensManager = ITokensManager(_tokensManager);
    }

    /**
     * @notice Sets the referral program contract address during initial setup
     * @dev Can only be called by the deployer and only if the referral program hasn't been set yet
     * @param _referralProgram Address of the referral program contract
     */
    function initialSetReferralProgram(address _referralProgram) external {
        accessRoles.requireDeployer(msg.sender);
        require(_referralProgram != address(0), "_referralProgram is zero!");
        require(address(referralProgram) == address(0), "referralProgram contract exists!");
        referralProgram = IReferralProgram(_referralProgram);
    }

    /**
     * @notice Authorization function for contract upgrades
     * @dev Only the owners multisig can upgrade the contract
     * @param newImplementation Address of the new implementation (unused parameter required by UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        accessRoles.requireOwnersMultisig(msg.sender);
    }
}
