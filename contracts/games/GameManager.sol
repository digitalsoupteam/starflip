// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { IAccessRoles } from "../_interfaces/access/IAccessRoles.sol";
import { IGame } from "../_interfaces/games/IGame.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IGameManager } from "../_interfaces/games/IGameManager.sol";

/**
 * @title GameManager
 * @notice Contract for managing game addresses on the platform
 * @dev Implements UUPS upgradeable pattern and provides functionality to add and track games
 */
contract GameManager is IGameManager, UUPSUpgradeable {
    /// @notice Reference to the address book contract
    IAddressBook private _addressBook;

    /// @notice Mapping of game addresses to their existence status (true if the game exists)
    mapping(address => bool) private _games;

    /// @notice Array of all registered game addresses
    address[] private _gameAddresses;
    /**
     * @notice Emitted when a new game is added to the platform
     * @param gameAddress The address of the game contract that was added
     */
    event GameAdded(address gameAddress);

    /**
     * @notice Constructor that disables initializers
     * @dev Prevents the implementation contract from being initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract with the address book reference
     * @dev Can only be called once due to the initializer modifier
     * @param addressBook Address of the AddressBook contract
     */
    function initialize(address addressBook) external initializer {
        require(addressBook != address(0), "Zero address");
        _addressBook = IAddressBook(addressBook);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Adds a new game to the platform
     * @dev Only the owners multisig can add new games
     * @dev Validates that the game contract implements the required interface
     * @param gameAddress The address of the game contract to add
     * @return success True if the game was added successfully
     */
    function addGame(address gameAddress) external returns (bool success) {
        _addressBook.accessRoles().requireOwnersMultisig(msg.sender);

        require(gameAddress != address(0), "Zero address");
        require(!_games[gameAddress], "Game already exists");
        require(_isValidGame(gameAddress), "Invalid game contract");

        _games[gameAddress] = true;
        _gameAddresses.push(gameAddress);

        emit GameAdded(gameAddress);

        return true;
    }

    /**
     * @notice Gets all registered game addresses
     * @dev Returns the complete list of games that have been added to the platform
     * @return An array of all game addresses
     */
    function getAllGames() external view returns (address[] memory) {
        return _gameAddresses;
    }

    /**
     * @notice Checks if a game exists on the platform
     * @dev Returns true if the game has been added to the platform
     * @param gameAddress The address of the game contract to check
     * @return True if the game exists, false otherwise
     */
    function isGameExist(address gameAddress) external view returns (bool) {
        return _games[gameAddress];
    }

    /**
     * @notice Validates that an address is a valid game contract
     * @dev Uses a try-catch to safely call the validation function
     * @param gameAddress The address to validate
     * @return True if the address is a valid game contract, false otherwise
     */
    function _isValidGame(address gameAddress) private view returns (bool) {
        try this._validateGameInterface(gameAddress) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    /**
     * @notice Validates that a contract implements the required game interface
     * @dev This function will revert if any call fails
     * @dev Checks that the contract implements the minBetAmount, maxBetAmount, and houseEdge functions
     * @param gameAddress The address to validate
     * @return True if the address is a valid game contract
     */
    function _validateGameInterface(address gameAddress) external view returns (bool) {
        IGame game = IGame(gameAddress);
        game.minBetAmount();
        game.maxBetAmount();
        game.houseEdge();
        return true;
    }

    /**
     * @notice Authorization function for contract upgrades
     * @dev Only the owners multisig can upgrade the contract
     * @param newImplementation Address of the new implementation (unused parameter required by UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        _addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }
}
