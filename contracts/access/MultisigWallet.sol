// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

import {IMultisigWallet} from "../_interfaces/access/IMultisigWallet.sol";
import {IAddressBook} from "../_interfaces/access/IAddressBook.sol";

/**
 * @title MultisigWallet
 * @notice Contract that implements a multi-signature wallet for secure transaction execution
 * @dev Requires a configurable number of signers to confirm transactions before execution
 *      Implements ERC165 for interface detection and UUPS for upgradeability
 */
contract MultisigWallet is IMultisigWallet, UUPSUpgradeable, ERC165 {
    using SafeERC20 for IERC20;

    /// @notice The minimum number of signers required to execute a transaction
    uint256 public requiredSigners;

    /// @notice Mapping of addresses to their signer status
    mapping(address => bool) public signers;

    /// @notice Array of all owner addresses that are signers
    address[] public owners;

    /// @notice Total count of signers
    uint256 public signersCount;

    /// @notice Total count of transactions submitted to the multisig
    uint256 public txsCount;

    /// @notice Mapping of transaction IDs to their creators
    mapping(uint256 txId => address creator) public txCreator;

    /// @notice Mapping of transaction IDs to their target addresses
    mapping(uint256 txId => address) public txTarget;

    /// @notice Mapping of transaction IDs to their ETH values
    mapping(uint256 txId => uint256) public txValue;

    /// @notice Mapping of transaction IDs to their calldata
    mapping(uint256 txId => bytes) public txData;

    /// @notice Mapping of transaction IDs to their execution status
    mapping(uint256 txId => bool) public txExecuted;

    /// @notice Mapping of transaction IDs to signer confirmations
    mapping(uint256 txId => mapping(address signer => bool accepted)) public txConfirmations;

    /// @notice Mapping of transaction IDs to their confirmation counts
    mapping(uint256 txId => uint256 count) public txConfirmationsCount;

    /**
     * @notice Constructor that disables initializers
     * @dev Prevents the implementation contract from being initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the multisig wallet with required signers and initial signers
     * @dev Can only be called once due to the initializer modifier
     * @param _requiredSigners Number of confirmations required for transaction execution
     * @param _signers Array of initial signer addresses
     */
    function initialize(uint256 _requiredSigners, address[] calldata _signers) external initializer {
        require(_requiredSigners > 0, "_requiredSigners must be greater than zero!");
        require(_signers.length >= _requiredSigners, "_requiredSigners > _signers.length");
        requiredSigners = _requiredSigners;
        for (uint256 i; i < _signers.length; ++i) {
            require(_signers[i] != address(0), "_signers contains zero address!");
            signers[_signers[i]] = true;
            ++signersCount;
        }
        owners = _signers;
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Withdraws tokens or ETH from the multisig wallet
     * @dev Can only be called by the multisig wallet itself (through an executed transaction)
     * @param _recipient Address to receive the withdrawn funds
     * @param _token Address of the token to withdraw (address(0) for ETH)
     * @param _amount Amount of tokens or ETH to withdraw
     */
    function withdraw(address _recipient, address _token, uint256 _amount) external {
        _requireSelfCall();
        require(_recipient != address(0), "_recipient is zero!");
        if (_token == address(0)) {
            Address.sendValue(payable(_recipient), _amount);
        } else {
            IERC20(_token).safeTransfer(_recipient, _amount);
        }
    }

    /**
     * @notice Submits a new transaction to the multisig wallet
     * @dev Can only be called by a signer, not by the multisig itself
     * @dev Automatically confirms the transaction for the submitter
     * @param _target Address that the transaction will be sent to
     * @param _value Amount of ETH to send with the transaction
     * @param _data Calldata to include in the transaction
     */
    function submitTransaction(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) external payable {
        require(_value == msg.value, "_value != msg.value");
        _requireNotSelfCall();
        _requireSigner();
        uint256 txId = ++txsCount;
        txCreator[txId] = msg.sender;
        txTarget[txId] = _target;
        txValue[txId] = _value;
        txData[txId] = _data;

        _confirmTransaction(txId);
    }

    /**
     * @notice Confirms a pending transaction
     * @dev Can only be called by a signer who hasn't already confirmed
     * @dev If this confirmation reaches the required threshold, the transaction is executed
     * @param _txId ID of the transaction to confirm
     */
    function acceptTransaction(uint256 _txId) external {
        _requireNotSelfCall();
        _requireSigner();
        _requireTransactionExists(_txId);
        _requireNotExecuted(_txId);
        require(txConfirmations[_txId][msg.sender] == false, "already confirmed!");

        _confirmTransaction(_txId);
    }

    /**
     * @notice Internal function to confirm a transaction and execute it if threshold is reached
     * @dev Records the confirmation and increments the confirmation count
     * @dev If confirmation count reaches the required threshold, executes the transaction
     * @param _txId ID of the transaction to confirm
     */
    function _confirmTransaction(uint256 _txId) internal {
        txConfirmations[_txId][msg.sender] = true;
        txConfirmationsCount[_txId]++;

        if (txConfirmationsCount[_txId] >= requiredSigners) {
            txExecuted[_txId] = true;
            (bool success, ) = txTarget[_txId].call{ value: txValue[_txId] }(txData[_txId]);
            require(success, "transaction call failure!");
        }
    }

    /**
     * @notice Revokes a previously given confirmation for a transaction
     * @dev Can only be called by a signer who has already confirmed the transaction
     * @dev The transaction must exist and not be executed yet
     * @param _txId ID of the transaction to revoke confirmation for
     */
    function revokeTransaction(uint256 _txId) external {
        _requireNotSelfCall();
        _requireSigner();
        _requireTransactionExists(_txId);
        _requireNotExecuted(_txId);
        require(txConfirmations[_txId][msg.sender], "not confirmed!");

        delete txConfirmations[_txId][msg.sender];
        --txConfirmationsCount[_txId];
    }

    /**
     * @notice Retrieves detailed information about a transaction
     * @dev Requires that the transaction exists
     * @param _txId ID of the transaction to retrieve
     * @param _signer Address to check for confirmation status
     * @return target The address the transaction will be sent to
     * @return value The amount of ETH sent with the transaction
     * @return data The calldata included in the transaction
     * @return creator The address that created the transaction
     * @return executed Whether the transaction has been executed
     * @return confirmationsCount The number of confirmations the transaction has received
     * @return alreadySigned Whether the specified signer has confirmed the transaction
     */
    function getTransaction(
        uint256 _txId,
        address _signer
    )
    external
    view
    returns (
        address target,
        uint256 value,
        bytes memory data,
        address creator,
        bool executed,
        uint256 confirmationsCount,
        bool alreadySigned
    )
    {
        _requireTransactionExists(_txId);
        target = txTarget[_txId];
        value = txValue[_txId];
        data = txData[_txId];
        creator = txCreator[_txId];
        executed = txExecuted[_txId];
        confirmationsCount = txConfirmationsCount[_txId];
        alreadySigned = txConfirmations[_txId][_signer];
    }

    /**
     * @notice Verifies that the caller is the multisig wallet itself
     * @dev Used to restrict functions that should only be callable through executed transactions
     */
    function _requireSelfCall() internal view {
        require(msg.sender == address(this), "only mutisig!");
    }

    /**
     * @notice Verifies that the caller is not the multisig wallet itself
     * @dev Used to prevent direct calls to functions that should only be called by external accounts
     */
    function _requireNotSelfCall() internal view {
        require(msg.sender != address(this), "self call disabled!");
    }

    /**
     * @notice Verifies that a transaction has not been executed
     * @dev Used to prevent operations on already executed transactions
     * @param _txId ID of the transaction to check
     */
    function _requireNotExecuted(uint256 _txId) internal view {
        require(txExecuted[_txId] == false, "tx already executed!");
    }

    /**
     * @notice Verifies that the caller is a signer
     * @dev Used to restrict functions to authorized signers only
     */
    function _requireSigner() internal view {
        require(signers[msg.sender], "only signer!");
    }

    /**
     * @notice Verifies that a transaction exists
     * @dev Checks that the transaction ID is valid and within range
     * @param _txId ID of the transaction to check
     */
    function _requireTransactionExists(uint256 _txId) internal view {
        require(_txId <= txsCount && _txId != 0, "not found txId!");
    }

    /**
     * @notice Checks if the contract supports a given interface
     * @dev Implements ERC165 interface detection
     * @param interfaceId The interface identifier to check
     * @return True if the contract supports the interface, false otherwise
     */
    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return
            interfaceId == type(IMultisigWallet).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @notice Authorization function for contract upgrades
     * @dev Only the multisig wallet itself can authorize an upgrade (through an executed transaction)
     * @param newImplementation Address of the new implementation (unused parameter required by UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        _requireSelfCall();
    }
}
