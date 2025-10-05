// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IAddressBook} from "../_interfaces/access/IAddressBook.sol";
import {ITokensManager} from "../_interfaces/tokens/ITokensManager.sol";
import {IPricer} from "../_interfaces/tokens/IPricer.sol";

contract TokensManager is ITokensManager, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    IAddressBook public addressBook;

    uint256 constant USD_DECIMALS = 18;
    uint256 constant PRICERS_DECIMALS = 8;
    address constant NATIVE_TOKEN = address(0);

    mapping(address token => IPricer pricer) public pricers;

    /**
     * @notice Constructor that disables initializers
     */
    constructor() {
        _disableInitializers();
    }

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

    function getPrice(address _token) public view returns (uint256) {
        IPricer pricer = pricers[_token];
        require(address(pricer) != address(0), "pricer not exists!");
        (, int256 price, , ,) = pricer.latestRoundData();
        require(price > 0, "price not exists!");
        return uint256(price);
    }

    function usdAmountToToken(
        uint256 _usdAmount,
        address _token
    ) external view returns (uint256 tokenAmount) {
        require(_usdAmount > 0, "_usdAmount is zero!");

        uint256 decimals;
        if (_token == NATIVE_TOKEN) {
            decimals = 18;
        } else {
            decimals = IERC20Metadata(_token).decimals();
        }

        tokenAmount =
            (_usdAmount * (10 ** decimals) * (10 ** PRICERS_DECIMALS)) /
            getPrice(_token) /
            10 ** USD_DECIMALS;

        require(tokenAmount > 0, "tokenAmount is zero!");
    }

    function requireTokenSupport(address _token) external view {
        require(address(pricers[_token]) != address(0), "token not supported!");
    }

    function setPricer(address _token, IPricer _pricer) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(address(_pricer) != address(0), "_pricer is zero!");
        require(_pricer.decimals() == PRICERS_DECIMALS, "PRICERS_DECIMALS!");

        pricers[_token] = _pricer;

        require(getPrice(_token) > 0, "current price is zero!");
    }

    function deleteToken(address _token) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        require(address(pricers[_token]) != address(0), "pricer not exists!");
        delete pricers[_token];
    }

    function _authorizeUpgrade(address) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }
}
