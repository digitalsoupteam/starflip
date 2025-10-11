// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import { IPricer } from "../_interfaces/tokens/IPricer.sol";
import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";

/**
 * @title Pricer
 * @notice Contract that provides price data in a format compatible with Chainlink price feeds
 * @dev Implements a simple price oracle that can be updated by the owners multisig
 */
contract Pricer is IPricer, UUPSUpgradeable {
    /// @notice Reference to the address book contract that provides access to other contracts
    IAddressBook public addressBook;

    /// @notice The current price value with 8 decimals of precision
    int256 public currentPrice;

    /// @notice Human-readable description of what this price feed represents
    string public description;

    /**
     * @notice Emitted when the price is updated
     * @param oldPrice The previous price value
     * @param newPrice The new price value that was set
     */
    event SetPrice(int256 oldPrice, int256 newPrice);

    /**
     * @notice Constructor that disables initializers
     * @dev Prevents the implementation contract from being initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract with the address book reference and initial price data
     * @dev Can only be called once due to the initializer modifier
     * @param _addressBook Address of the address book contract
     * @param _initialPrice Initial price value with 8 decimals of precision
     * @param _description Human-readable description of what this price feed represents
     */
    function initialize(
        address _addressBook,
        int256 _initialPrice,
        string calldata _description
    ) external initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        require(_initialPrice > 0, "_initialPrice must be greater than zero!");

        addressBook = IAddressBook(_addressBook);
        currentPrice = _initialPrice;
        description = _description;
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Authorization function for contract upgrades
     * @dev Only the owners multisig can upgrade the contract
     * @param newImplementation Address of the new implementation (unused parameter required by UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    /**
     * @notice Updates the current price value
     * @dev Only the owners multisig can update the price
     * @dev Emits a SetPrice event with the old and new price values
     * @param _newPrice The new price value to set (must be greater than zero)
     */
    function setCurrentPrice(int256 _newPrice) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_newPrice > 0, "price is zero!");

        int256 oldPrice = currentPrice;
        currentPrice = _newPrice;

        emit SetPrice(oldPrice, _newPrice);
    }

    /**
     * @notice Returns the number of decimals used in the price feed
     * @dev Always returns 8 to match Chainlink price feed standard
     * @return The number of decimals (8)
     */
    function decimals() external pure returns (uint8) {
        return 8;
    }

    /**
     * @notice Returns the latest price data in a format compatible with Chainlink price feeds
     * @dev Only the answer field is populated with the current price, other fields are left at their default values
     * @return roundId The round ID (always 0)
     * @return answer The current price value
     * @return startedAt The timestamp when the round started (always 0)
     * @return updatedAt The timestamp when the round was updated (always 0)
     * @return answeredInRound The round ID in which the answer was computed (always 0)
     */
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        answer = currentPrice;
    }
}
