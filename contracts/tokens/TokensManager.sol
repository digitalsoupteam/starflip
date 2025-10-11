// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAddressBook} from "../_interfaces/access/IAddressBook.sol";
import {ITokensManager} from "../_interfaces/tokens/ITokensManager.sol";
import {IPricer} from "../_interfaces/tokens/IPricer.sol";

/**
 * @title TokensManager
 * @notice Contract that manages token prices and provides conversion functionality
 * @dev Uses price oracles (pricers) to get token prices and convert between USD and token amounts
 */
contract TokensManager is ITokensManager, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    /// @notice Reference to the address book contract that provides access to other contracts
    IAddressBook public addressBook;

    /// @notice Number of decimals used for USD amounts (18 decimals)
    uint256 constant USD_DECIMALS = 18;

    /// @notice Number of decimals used by price oracles (8 decimals)
    uint256 constant PRICERS_DECIMALS = 8;

    /// @notice Mapping of token addresses to their respective price oracle contracts
    mapping(address token => IPricer pricer) public pricers;

    /**
     * @notice Constructor that disables initializers
     * @dev Prevents the implementation contract from being initialized
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes the contract with the address book reference and initial tokens with their pricers
     * @dev Can only be called once due to the initializer modifier
     * @dev Validates that all pricers have the correct decimals and return valid prices
     * @param _addressBook Address of the address book contract
     * @param _tokens Array of token addresses to support initially
     * @param _pricers Array of price oracle contracts corresponding to each token
     */
    function initialize(
        address _addressBook,
        address[] calldata _tokens,
        IPricer[] calldata _pricers
    ) external initializer {
        require(_addressBook != address(0), "_addressBook is zero!");
        addressBook = IAddressBook(_addressBook);
        require(_tokens.length == _pricers.length, "_tokens length != _pricers length");

        for (uint256 i; i < _pricers.length; ++i) {
            require(_tokens[i] != address(_pricers[i]), "token == pricer");
            require(address(_pricers[i]) != address(0), "pricer is zero!");
            require(_pricers[i].decimals() == PRICERS_DECIMALS, "PRICERS_DECIMALS!");

            pricers[_tokens[i]] = _pricers[i];

            require(getPrice(_tokens[i]) > 0, "pricer current price is zero!");
        }

        __UUPSUpgradeable_init();
    }

    /**
     * @notice Gets the current price of a token
     * @dev Retrieves the price from the token's price oracle
     * @param _token Address of the token to get the price for
     * @return The current price of the token with 8 decimals of precision
     */
    function getPrice(address _token) public view returns (uint256) {
        IPricer pricer = pricers[_token];
        require(address(pricer) != address(0), "pricer not exists!");
        (, int256 price, , ,) = pricer.latestRoundData();
        require(price > 0, "price not exists!");
        return uint256(price);
    }

    /**
     * @notice Converts a USD amount to the equivalent amount in a specific token
     * @dev Uses the token's price and decimals to calculate the conversion
     * @dev For native token (address(0)), assumes 18 decimals
     * @param _usdAmount Amount in USD with 18 decimals
     * @param _token Address of the token to convert to (address(0) for native token)
     * @return tokenAmount The equivalent amount in the specified token
     */
    function usdAmountToToken(
        uint256 _usdAmount,
        address _token
    ) external view returns (uint256 tokenAmount) {
        require(_usdAmount > 0, "_usdAmount is zero!");

        uint256 decimals;
        if (_token == address(0)) {
            decimals = 18;
        } else {
            require(_token.code.length > 0, "Invalid token address");
            decimals = IERC20Metadata(_token).decimals();
        }

        tokenAmount =
            (_usdAmount * (10 ** decimals) * (10 ** PRICERS_DECIMALS)) /
            getPrice(_token) /
            (10 ** USD_DECIMALS);

        require(tokenAmount > 0, "tokenAmount is zero!");
    }

    /**
     * @notice Checks if a token is supported by the platform
     * @dev Reverts if the token does not have a price oracle configured
     * @param _token Address of the token to check
     */
    function requireTokenSupport(address _token) external view {
        require(address(pricers[_token]) != address(0), "token not supported!");
    }

    /**
     * @notice Sets or updates a price oracle for a token
     * @dev Only the owners multisig can set or update price oracles
     * @dev Validates that the price oracle has the correct decimals and returns a valid price
     * @param _token Address of the token to set the price oracle for
     * @param _pricer Address of the price oracle contract
     */
    function setPricer(address _token, IPricer _pricer) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(address(_pricer) != address(0), "_pricer is zero!");
        require(_pricer.decimals() == PRICERS_DECIMALS, "PRICERS_DECIMALS!");

        pricers[_token] = _pricer;

        require(getPrice(_token) > 0, "current price is zero!");
    }

    /**
     * @notice Removes a token from the supported tokens list
     * @dev Only administrators can remove tokens
     * @dev Reverts if the token is not currently supported
     * @param _token Address of the token to remove
     */
    function deleteToken(address _token) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        require(address(pricers[_token]) != address(0), "pricer not exists!");
        delete pricers[_token];
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
