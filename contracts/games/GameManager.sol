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
 * @dev Contract for managing game addresses on the platform
 * @dev Implements UUPS upgradeable pattern
 */
contract GameManager is IGameManager, UUPSUpgradeable {
    IAddressBook private _addressBook;
    mapping(address => bool) private _games;
    address[] private _gameAddresses;
    /**
     * @dev Emitted when a new game is added
     * @param gameAddress The address of the game contract
     */
    event GameAdded(address gameAddress);

    /**
     * @notice Constructor that disables initializers
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @dev Initializes the contract
     * @param addressBook Address of the AddressBook contract
     */
    function initialize(address addressBook) external initializer {
        require(addressBook != address(0), "Zero address");
        _addressBook = IAddressBook(addressBook);
        __UUPSUpgradeable_init();
    }

    /**
     * @dev Adds a new game to the platform
     * @param gameAddress The address of the game contract
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
     * @dev Gets all game addresses
     * @return An array of all game addresses
     */
    function getAllGames() external view returns (address[] memory) {
        return _gameAddresses;
    }

    /**
     * @dev True if game exist
     * @param gameAddress The address of the game contract
     * @return True if game exist
     */
    function isGameExist(address gameAddress) external view returns (bool) {
        return _games[gameAddress];
    }

    /**
     * @dev Validates that an address is a valid game contract
     * @param gameAddress The address to validate
     * @return True if the address is a valid game contract
     */
    function _isValidGame(address gameAddress) private view returns (bool) {
        try this._validateGameInterface(gameAddress) returns (bool result) {
            return result;
        } catch {
            return false;
        }
    }

    /**
     * @dev This function will revert if any call fails
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
     * @dev Authorizes an upgrade to a new implementation
     * @dev Only the owners multisig can upgrade the contract
     */
    function _authorizeUpgrade(address) internal view override {
        _addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }
}
