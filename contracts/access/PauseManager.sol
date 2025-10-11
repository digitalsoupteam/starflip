// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IPauseManager } from "../_interfaces/access/IPauseManager.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";

/**
 * @title PauseManager
 * @notice Contract that manages the pause functionality for the platform
 * @dev Allows administrators to pause the entire system or specific contracts
 *      Only owners multisig can unpause the system or contracts
 */
contract PauseManager is IPauseManager, UUPSUpgradeable {
    /// @notice Reference to the address book contract that provides access to other contracts
    IAddressBook public addressBook;

    /// @notice Flag indicating if the entire system is paused (true = paused)
    bool public enabled;

    /// @notice Mapping of contract addresses to their paused status (true = paused)
    mapping(address => bool paused) public pausedContracts;

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
     * @param _addressBook Address of the address book contract
     */
    function initialize(address _addressBook) external initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Pauses the entire system
     * @dev Only administrators can pause the system
     * @dev Sets the enabled flag to true, indicating the system is paused
     */
    function pause() external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        enabled = true;
    }

    /**
     * @notice Pauses a specific contract
     * @dev Only administrators can pause contracts
     * @param _contract Address of the contract to pause
     */
    function pauseContract(address _contract) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        pausedContracts[_contract] = true;
    }

    /**
     * @notice Unpauses the entire system
     * @dev Only the owners multisig can unpause the system
     * @dev Sets the enabled flag to false, indicating the system is not paused
     */
    function unpause() external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        enabled = false;
    }

    /**
     * @notice Unpauses a specific contract
     * @dev Only the owners multisig can unpause contracts
     * @param _contract Address of the contract to unpause
     */
    function unpauseContract(address _contract) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        pausedContracts[_contract] = false;
    }

    /**
     * @notice Checks if the caller is not paused
     * @dev Reverts if either the entire system is paused or the specific caller contract is paused
     */
    function requireNotPaused() external view {
        require(enabled == false && pausedContracts[msg.sender] == false, "paused!");
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
