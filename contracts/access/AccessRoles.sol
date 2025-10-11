// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IAccessRoles} from "../_interfaces/access/IAccessRoles.sol";
import {IMultisigWallet} from "../_interfaces/access/IMultisigWallet.sol";

/**
 * @title AccessRoles
 * @notice Contract that manages access control roles for the platform
 * @dev Implements role-based access control with three main roles:
 *      1. Owners (via multisig wallet) - highest authority that can change system parameters
 *      2. Administrators - accounts with elevated privileges
 *      3. Deployer - special role for initial deployment operations
 */
contract AccessRoles is IAccessRoles, UUPSUpgradeable {
    /// @notice Reference to the multisig wallet contract that represents the owners
    IMultisigWallet public ownersMultisig;

    /// @notice Mapping of administrator addresses to their status
    mapping(address account => bool) public administrators;

    /// @notice Address of the deployer with special privileges during initial setup
    address public deployer;

    /**
     * @notice Constructor that disables initializers
     * @dev Prevents the implementation contract from being initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract with owners multisig and administrators
     * @dev Can only be called once due to the initializer modifier
     * @param _ownersMultisig Address of the multisig wallet contract for owners
     * @param _administrators Array of initial administrator addresses
     */
    function initialize(
        address _ownersMultisig,
        address[] calldata _administrators
    ) external initializer {
        require(_ownersMultisig != address(0), "_ownersMultisig is zero!");
        ownersMultisig = IMultisigWallet(_ownersMultisig);
        for (uint256 i; i < _administrators.length; ++i) {
            address administrator = _administrators[i];
            require(administrator != address(0), "_administrators contains zero address!");
            administrators[administrator] = true;
        }
        deployer = msg.sender;
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Updates the address of the owners multisig wallet
     * @dev Only callable by the current owners multisig
     * @dev Verifies that the new address supports the IMultisigWallet interface
     * @param _ownersMultisig New address of the multisig wallet contract
     */
    function setOwnersMultisig(address _ownersMultisig) external {
        requireOwnersMultisig(msg.sender);
        bool supportsInterface;
        if (_ownersMultisig.code.length > 0) {
            try
            IERC165(_ownersMultisig).supportsInterface(type(IMultisigWallet).interfaceId)
            returns (bool result) {
                supportsInterface = result;
            } catch {}
        }

        require(supportsInterface, "not supported multisig wallet!");
        ownersMultisig = IMultisigWallet(_ownersMultisig);
    }

    /**
     * @notice Sets or removes an administrator
     * @dev Only callable by the owners multisig
     * @param _administrator Address to set or remove as administrator
     * @param _value True to add as administrator, false to remove
     */
    function setAdministrator(address _administrator, bool _value) external {
        requireOwnersMultisig(msg.sender);
        administrators[_administrator] = _value;
    }

    /**
     * @notice Updates the deployer address
     * @dev Only callable by the owners multisig
     * @param _deployer New deployer address
     */
    function setDeployer(address _deployer) external {
        requireOwnersMultisig(msg.sender);
        deployer = _deployer;
    }

    /**
     * @notice Allows the deployer to renounce their role
     * @dev Only callable by the current deployer
     */
    function renounceDeployer() external {
        requireDeployer(msg.sender);
        delete deployer;
    }

    /**
     * @notice Checks if an account is the deployer
     * @dev Reverts if the account is not the deployer
     * @param _account Address to check
     */
    function requireDeployer(address _account) public view {
        require(_account == deployer, "only deployer!");
    }

    /**
     * @notice Checks if an account is the owners multisig
     * @dev Reverts if the account is not the owners multisig
     * @param _account Address to check
     */
    function requireOwnersMultisig(address _account) public view {
        require(_account == address(ownersMultisig), "only owners multisig!");
    }

    /**
     * @notice Checks if an account is an administrator
     * @dev Reverts if the account is not an administrator
     * @param _account Address to check
     */
    function requireAdministrator(address _account) external view {
        require(isAdministrator(_account), "only administrator!");
    }

    /**
     * @notice Checks if an account is an administrator
     * @dev An account is considered an administrator if it's in the administrators mapping
     *      or if it's a signer in the owners multisig
     * @param _account Address to check
     * @return True if the account is an administrator, false otherwise
     */
    function isAdministrator(address _account) public view returns (bool) {
        return administrators[_account] || ownersMultisig.signers(_account);
    }

    /**
     * @notice Authorization function for contract upgrades
     * @dev Only the owners multisig can upgrade the contract
     * @param newImplementation Address of the new implementation (unused parameter required by UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        requireOwnersMultisig(msg.sender);
    }
}
