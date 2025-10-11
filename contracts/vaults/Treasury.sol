// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { MulticallUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/MulticallUpgradeable.sol";
import { ERC721HolderUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { IAddressBook } from "../_interfaces/access/IAddressBook.sol";
import { ITokensManager } from "../_interfaces/tokens/ITokensManager.sol";

/**
 * @title Treasury
 * @notice Contract that holds and manages funds for the platform
 * @dev Implements UUPS upgradeable pattern and multicall functionality
 *      Allows the owners multisig to withdraw funds (native or ERC20 tokens)
 */
contract Treasury is UUPSUpgradeable, MulticallUpgradeable {
    using SafeERC20 for IERC20;
    using Address for address payable;

    /// @notice Reference to the address book contract that provides access to other contracts
    IAddressBook public addressBook;

    /**
     * @notice Constructor that disables initializers
     * @dev Prevents the implementation contract from being initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Receive function to allow the contract to receive ETH
     * @dev Enables the treasury to receive native tokens directly
     */
    receive() external payable {}

    /**
     * @notice Initializes the contract with the address book reference
     * @dev Can only be called once due to the initializer modifier
     * @dev Initializes the UUPSUpgradeable functionality
     * @param _addressBook Address of the address book contract
     */
    function initialize(address _addressBook) external initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Withdraw funds (native or ERC20) from the contract
     * @dev Only the owners multisig can withdraw funds
     * @dev Checks that the contract has sufficient balance before withdrawing
     * @dev Uses Address.sendValue for ETH transfers and SafeERC20 for token transfers
     * @param _token The address of the token to withdraw (use address(0) for ETH)
     * @param _amount The amount to withdraw (must be greater than zero)
     * @param _recipient The address to send the funds to (cannot be zero address)
     */
    function withdraw(address _token, uint256 _amount, address _recipient) public {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_amount > 0, "_amount is zero!");
        require(_recipient != address(0), "_recipient is zero!");

        if (_token == address(0)) {
            require(_amount <= address(this).balance, "Insufficient contract balance");
            payable(_recipient).sendValue(_amount);
        } else {
            IERC20 token = IERC20(_token);
            require(_amount <= token.balanceOf(address(this)), "Insufficient token balance");
            token.safeTransfer(_recipient, _amount);
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
