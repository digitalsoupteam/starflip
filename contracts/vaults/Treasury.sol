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

contract Treasury is UUPSUpgradeable, MulticallUpgradeable {
    using SafeERC20 for IERC20;
    using Address for address payable;

    address constant NATIVE_TOKEN = address(0);

    IAddressBook public addressBook;

    /**
     * @notice Constructor that disables initializers
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Receive function to allow the contract to receive ETH
     */
    receive() external payable {}

    function initialize(address _addressBook) external initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Withdraw funds (native or ERC20) from the contract (owners multisig only)
     * @dev Allows the owners multisig to withdraw funds from the contract
     * @param _token The address of the token to withdraw (use NATIVE_TOKEN for ETH)
     * @param _amount The amount to withdraw
     * @param _recipient The address to send the funds to
     */
    function withdraw(address _token, uint256 _amount, address _recipient) public {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(_amount > 0, "_amount is zero!");
        require(_recipient != address(0), "_recipient is zero!");

        if (_token == NATIVE_TOKEN) {
            require(_amount <= address(this).balance, "Insufficient contract balance");
            payable(_recipient).sendValue(_amount);
        } else {
            IERC20 token = IERC20(_token);
            require(_amount <= token.balanceOf(address(this)), "Insufficient token balance");
            token.safeTransfer(_recipient, _amount);
        }
    }


    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }
}
