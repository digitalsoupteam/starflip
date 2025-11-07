// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IVRFCoordinatorV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFConsumerBaseV2Plus} from "@chainlink/contracts/src/v0.8/vrf/dev/VRFConsumerBaseV2Plus.sol";
import {VRFV2PlusClient} from "@chainlink/contracts/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IGame} from "../_interfaces/games/IGame.sol";
import {IAddressBook} from "../_interfaces/access/IAddressBook.sol";
import {ITokensManager} from "../_interfaces/tokens/ITokensManager.sol";
import {AddressBook} from "../access/AddressBook.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Grid Contract
 * @notice A contract that provides a grid roll function using Chainlink VRF v2.5 for randomness
 * @dev Returns a random winning cells(between 1 and 25) and allows betting
 * @dev Implements UUPS upgradeable pattern
 */
contract Grid is VRFConsumerBaseV2Plus, UUPSUpgradeable, IGame {
    using SafeERC20 for IERC20;
    using Address for address payable;

    /// @notice Chainlink VRF subscription ID
    uint256 private subscriptionId;
    /// @notice Chainlink VRF key hash for the gas lane
    bytes32 private keyHash;
    /// @notice Gas limit for the Chainlink VRF callback
    uint32 private callbackGasLimit;
    /// @notice Number of confirmations required for Chainlink VRF
    uint16 private requestConfirmations;
    /// @notice Reference to the address book contract
    IAddressBook private addressBook;
    /// @notice Total quantity of cells in the game
    uint8 public totalCellsQuantity;
    /// @notice Cells quantity allowed in the game
    uint8 public cellsQuantity;
    /// @notice Minimum bet amount allowed in the game (in wei)
    uint256 public minBetAmount;
    /// @notice Maximum bet amount allowed in the game (in wei)
    uint256 public maxBetAmount;
    /// @notice House edge percentage (e.g., 10 for 10%)
    uint8 public houseEdge;

    /**
     * @notice Struct representing a bet in the grid game
     * @dev Stores all information about a player's bet
     */
    struct Bet {
        /// @notice Amount of tokens bet
        uint256 amount;
        /// @notice Array of selected cells
        uint32 cells;
        /// @notice Whether the bet has been settled
        bool settled;
        /// @notice Whether the bet was won
        bool won;
        /// @notice Pot amount
        uint256 pot;
        /// @notice Address of the token used for the bet (address(0) for ETH)
        address token;
    }

    /// @notice Mapping from Chainlink VRF request ID to the address of the player who made the request
    mapping(uint256 => address) private requestIdToSender;
    /// @notice Mapping from player address to their latest roll result (type(uint32).max indicates roll in progress)
    mapping(address => uint32) private rollResults;
    /// @notice Mapping from player address to their current bet
    mapping(address => Bet) private bets;
    /// @notice Mapping from Chainlink VRF request ID to the associated bet
    mapping(uint256 => Bet) private requestIdToBet;

    /**
     * @notice Event emitted when a grid roll is requested
     * @param requestId The Chainlink VRF request ID
     * @param roller The address of the player making the roll
     * @param betAmount The amount of tokens bet
     * @param cellMask A uint32 bitmask representing the cells the user selected. Each bit set to 1 corresponds to a selected cell (0-24 for a 5x5 grid).
     * @param token The address of the token used for the bet (address(0) for ETH)
     */
    event GridRollRequested(
        uint256 indexed requestId,
        address indexed roller,
        uint256 betAmount,
        uint32 cellMask,
        address token
    );

    /**
     * @notice Event emitted when a grid roll is fulfilled by Chainlink VRF
     * @param requestId The Chainlink VRF request ID
     * @param roller The address of the player who made the roll
     * @param result The result of the grid roll (cells mask)
     * @param won Whether the player won the bet
     * @param payout The amount paid out to the player (0 if lost)
     * @param token The address of the token used for the bet (address(0) for ETH)
     */
    event GridRollFulfilled(
        uint256 indexed requestId,
        address indexed roller,
        uint32 result,
        bool won,
        uint256 payout,
        address token
    );

    /**
     * @notice Event emitted when a bet is settled
     * @param player The address of the player who made the bet
     * @param amount The amount of tokens bet
     * @param cellMask A uint32 bitmask representing the cells the user selected. Each bit set to 1 corresponds to a selected cell (0-24 for a 5x5 grid).
     * @param result The result of the grid roll (cells mask)
     * @param won Whether the player won the bet
     * @param payout The amount paid out to the player (0 if lost)
     * @param token The address of the token used for the bet (address(0) for ETH)
     */
    event BetSettled(
        address indexed player,
        uint256 amount,
        uint32 cellMask,
        uint32 result,
        bool won,
        uint256 payout,
        address token
    );

    /// @notice Error thrown when a player tries to roll while a previous roll is still in progress
    error RollInProgress();
    /// @notice Error thrown when a roll is outside the valid range
    error InvalidRollRange();
    /// @notice Error thrown when a bet amount is outside the allowed range
    error InvalidBetAmount();
    /// @notice Error thrown when a cells quantity is outside the allowed range
    error InvalidCellsQuantity();
    /// @notice Error thrown when the contract has insufficient balance to pay out a potential win
    error InsufficientContractBalance();

    /// @notice Event emitted when the subscription ID is updated
    event SubscriptionIdSet(uint256 subscriptionId);

    /**
     * @notice Constructor that disables initializers
     * @param _vrfCoordinator The address of the VRF Coordinator
     */
    constructor(address _vrfCoordinator) VRFConsumerBaseV2Plus(_vrfCoordinator) {
        _disableInitializers();
    }

    /**
     * @notice Initializes the Grid contract with Chainlink VRF parameters
     * @param _vrfCoordinator The address of the VRF Coordinator
     * @param _subscriptionId The ID of the VRF subscription
     * @param _keyHash The gas lane key hash
     * @param _addressBook The address of the AddressBook contract
     * @param _minBetAmount The minimum bet amount allowed in the game (in wei)
     * @param _maxBetAmount The maximum bet amount allowed in the game (in wei)
     * @param _houseEdge The house edge percentage (e.g., 10 for 10%)
     */
    function initialize(
        address _vrfCoordinator,
        uint256 _subscriptionId,
        bytes32 _keyHash,
        address _addressBook,
        uint256 _minBetAmount,
        uint256 _maxBetAmount,
        uint8 _houseEdge
    ) external initializer {
        require(_vrfCoordinator != address(0), "_vrfCoordinator is zero!");
        require(_addressBook != address(0), "_addressBook is zero!");
        require(_houseEdge <= 50, "House edge must be less than or equal to 50");
        require(_minBetAmount > 0, "Min bet amount must be greater than 0");
        require(_minBetAmount < _maxBetAmount, "Min bet amount must be less than max bet");
        require(_maxBetAmount > _minBetAmount, "Max bet amount must be greater than min bet");

        s_vrfCoordinator = IVRFCoordinatorV2Plus(_vrfCoordinator);
        subscriptionId = _subscriptionId;
        keyHash = _keyHash;
        callbackGasLimit = 300000;
        requestConfirmations = 3;
        addressBook = IAddressBook(_addressBook);
        totalCellsQuantity = 25;
        cellsQuantity = 5;
        minBetAmount = _minBetAmount;
        maxBetAmount = _maxBetAmount;
        houseEdge = _houseEdge;
        __UUPSUpgradeable_init();
    }

    /**
     * @notice Authorizes an upgrade to a new implementation
     * @dev Only the owners multisig can upgrade the contract
     * @param newImplementation Address of the new implementation (unused parameter required by UUPS)
     */
    function _authorizeUpgrade(address newImplementation) internal view override {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
    }

    /**
     * @notice Receive function to allow the contract to receive ETH
     */
    receive() external payable {}

    /**
     * @notice Fallback function to allow the contract to receive ETH
     */
    fallback() external payable {}

    function _popcount32(uint32 x) internal pure returns (uint8 count) {
        count = 0;
        while (x != 0) {
            count += uint8(x & 1);
            x >>= 1;
        }
    }

    function calculatePot(uint256 betAmount) public view returns (uint256 pot) {
        pot = betAmount * 2 * (100 - houseEdge) / 100;
    }

    /**
     * @notice Initiates a Grid roll with either a native token (ETH) or ERC20 token bet and requests randomness from Chainlink VRF
     * @dev Validates bet parameters, stores the bet, and sends a VRF request
     * @param cellMask A uint32 bitmask representing the cells the user selected. Each bit set to 1 corresponds to a selected cell (0-24 for a 5x5 grid).
     * @param token The address of the token to bet with (use address(0) for ETH)
     * @param betAmount The amount of tokens to bet (ignored for native token, use msg.value instead)
     * @return requestId The ID of the Chainlink VRF request associated with this grid roll
     */
    function roll(
        uint32 cellMask,
        address token,
        uint256 betAmount
    ) public payable returns (uint256) {
        require(
            addressBook.gameManager().isGameExist(address(this)),
            "Game doesn't exist in GameManager"
        );
        addressBook.pauseManager().requireNotPaused();
        addressBook.tokensManager().requireTokenSupport(token);

        uint256 actualBetAmount;
        if (token == address(0)) {
            actualBetAmount = msg.value;
            require(
                betAmount == 0 || betAmount == msg.value,
                "Bet amount must match msg.value for native token"
            );
        } else {
            actualBetAmount = betAmount;
            require(msg.value == 0, "Cannot send ETH when betting with tokens");
            IERC20(token).safeTransferFrom(msg.sender, address(this), actualBetAmount);
        }

        if (rollResults[msg.sender] == type(uint32).max) revert RollInProgress();
        if (actualBetAmount < minBetAmount || actualBetAmount > maxBetAmount) revert InvalidBetAmount();
        if (_popcount32(cellMask) != cellsQuantity) revert InvalidCellsQuantity();

        uint256 pot = calculatePot(actualBetAmount);

        if (token == address(0)) {
            if (address(this).balance < pot) revert InsufficientContractBalance();
        } else {
            if (IERC20(token).balanceOf(address(this)) < pot) revert InsufficientContractBalance();
        }

        rollResults[msg.sender] = type(uint32).max;

        Bet memory bet = Bet({
            amount: actualBetAmount,
            cells: cellMask,
            settled: false,
            won: false,
            pot: pot,
            token: token
        });

        bets[msg.sender] = bet;

        VRFV2PlusClient.RandomWordsRequest memory request = VRFV2PlusClient.RandomWordsRequest({
            keyHash: keyHash,
            subId: subscriptionId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: 1,
            extraArgs: VRFV2PlusClient._argsToBytes(
                VRFV2PlusClient.ExtraArgsV1({nativePayment: false})
            )
        });

        uint256 requestId = s_vrfCoordinator.requestRandomWords(request);

        requestIdToSender[requestId] = msg.sender;
        requestIdToBet[requestId] = bet;

        emit GridRollRequested(requestId, msg.sender, actualBetAmount, cellMask, token);

        return requestId;
    }


    function _deriveWinningCellsFromRandom(uint256 rw) public view returns (uint32 mask) {
        uint8 total = totalCellsQuantity;
        uint8 pick = cellsQuantity;

        uint8[] memory arr = new uint8[](total);
        for (uint8 i = 0; i < total; i++) {
            arr[i] = i;
        }

        uint256 rnd = rw;
        uint8 remaining = total;
        mask = 0;

        for (uint8 j = 0; j < pick; j++) {
            uint256 idx = rnd % remaining;
            uint8 val = arr[idx];
            mask |= uint32(1) << val;

            arr[idx] = arr[remaining - 1];
            remaining--;

            rnd = uint256(keccak256(abi.encode(rnd, j)));
        }
    }


    function calculatePayout(Bet memory bet, uint32 winningMask) internal pure returns (uint256 payout) {
        uint8 matches = _popcount32(bet.cells & winningMask);
        uint8 sharePercent;

        if (matches == 0) sharePercent = 0;
        else if (matches == 1) sharePercent = 30;
        else if (matches == 2) sharePercent = 40;
        else if (matches == 3) sharePercent = 70;
        else if (matches == 4) sharePercent = 90;
        else if (matches == 5) sharePercent = 100;

        payout = bet.pot * sharePercent / 100;
    }

    /**
     * @notice Callback function used by Chainlink VRF to deliver random words
     * @dev Processes the random words, calculates the grid roll result, and settles the bet
     * @param requestId The ID of the request
     * @param randomWords The random words generated by Chainlink VRF
     */
    function fulfillRandomWords(
        uint256 requestId,
        uint256[] calldata randomWords
    ) internal override {
        address roller = requestIdToSender[requestId];
        Bet storage bet = requestIdToBet[requestId];

        uint32 winningMask = _deriveWinningCellsFromRandom(randomWords[0]);
        rollResults[roller] = winningMask;

        uint256 payout = calculatePayout(bet, winningMask);

        bet.settled = true;
        bet.won = payout > 0;

        bets[roller] = bet;

        if (bet.won) {
            if (bet.token == address(0)) {
                payable(roller).sendValue(payout);
            } else {
                IERC20(bet.token).safeTransfer(roller, payout);
            }
        }

        emit GridRollFulfilled(requestId, roller, winningMask, bet.won, payout, bet.token);
        emit BetSettled(
            roller,
            bet.amount,
            bet.cells,
            winningMask,
            bet.won,
            payout,
            bet.token
        );

        addressBook.referralProgram().addReward(roller, bet.amount, bet.token);
    }

    /**
     * @notice Get the latest grid roll result for the caller
     * @dev Returns the latest roll result or 0 if no roll has been made
     * @return The grid roll result (cells mask)
     */
    function getLatestRollResult() external view returns (uint32) {
        uint32 result = rollResults[msg.sender];

        if (result == type(uint32).max) return 0;

        return result;
    }

    /**
     * @notice Check if a roll is in progress for the caller
     * @dev Returns true if a roll is in progress, false otherwise
     * @return True if a roll is in progress, false otherwise
     */
    function isRollInProgress() external view returns (bool) {
        return rollResults[msg.sender] == type(uint32).max;
    }

    /**
     * @notice Get the current bet details for the caller
     * @dev Returns the current bet details for the caller
     * @return amount The bet amount
     * @return cells The cells mask that user selected
     * @return settled Whether the bet has been settled
     * @return won Whether the bet was won
     * @return pot The bet pot
     */
    function getCurrentBet()
    external
    view
    returns (
        uint256 amount,
        uint32 cells,
        bool settled,
        bool won,
        uint256 pot
    )
    {
        Bet memory bet = bets[msg.sender];
        return (bet.amount, bet.cells, bet.settled, bet.won, bet.pot);
    }

    /**
     * @notice Get the contract balance
     * @dev Returns the current balance of the contract
     * @return The contract balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Withdraw funds (native or ERC20) from the contract to treasury (administrators only)
     * @dev Allows the administrators to withdraw funds from the contract to treasury
     * @param _token The address of the token to withdraw (use address(0) for ETH)
     * @param _amount The amount to withdraw
     */
    function withdrawToTreasury(address _token, uint256 _amount) external {
        addressBook.accessRoles().requireAdministrator(msg.sender);
        require(_amount > 0, "_amount is zero!");

        if (_token != address(0)) addressBook.tokensManager().requireTokenSupport(_token);

        if (_token == address(0)) {
            require(_amount <= address(this).balance, "Insufficient contract balance");
            Address.sendValue(payable(addressBook.treasury()), _amount);
        } else {
            IERC20 token = IERC20(_token);
            require(_amount <= token.balanceOf(address(this)), "Insufficient token balance");
            token.safeTransfer(addressBook.treasury(), _amount);
        }
    }

    /**
     * @notice Sets the minimum bet amount (owners multisig only)
     * @dev Allows the owners multisig to update the minimum bet amount
     * @param newMinBetAmount The new minimum bet amount
     */
    function setMinBetAmount(uint256 newMinBetAmount) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newMinBetAmount > 0, "Min bet amount must be greater than 0");
        require(newMinBetAmount < maxBetAmount, "Min bet amount must be less than max bet");
        minBetAmount = newMinBetAmount;
    }

    /**
     * @notice Sets the maximum bet amount (owners multisig only)
     * @dev Allows the owners multisig to update the maximum bet amount
     * @param newMaxBetAmount The new maximum bet amount
     */
    function setMaxBetAmount(uint256 newMaxBetAmount) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newMaxBetAmount > minBetAmount, "Max bet amount must be greater than min bet");
        maxBetAmount = newMaxBetAmount;
    }

    /**
     * @notice Sets the house edge percentage (owners multisig only)
     * @dev Allows the owners multisig to update the house edge percentage
     * @param newHouseEdge The new house edge percentage
     */
    function setHouseEdge(uint8 newHouseEdge) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newHouseEdge <= 50, "House edge must be less than or equal to 50");
        houseEdge = newHouseEdge;
    }

    /**
     * @notice Sets the gas limit for Chainlink callback function
     * @dev Allows the owners multisig to update the gas limit
     * @param newGasLimit The new gas limit
     */
    function setCallbackGasLimit(uint32 newGasLimit) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);
        require(newGasLimit > 50000, "Gas limit too low");
        callbackGasLimit = newGasLimit;
    }

    /**
     * @notice Updates the VRF Coordinator and/or subscription ID (owners multisig only)
     * @dev Allows the owners multisig to update the VRF Coordinator address and subscription ID in one call
     * @param newCoordinator The address of the new VRF Coordinator (set to address(0) to leave unchanged)
     * @param newSubscriptionId The new subscription ID (set to 0 to leave unchanged)
     */
    function updateVRFSettings(address newCoordinator, uint256 newSubscriptionId) external {
        addressBook.accessRoles().requireOwnersMultisig(msg.sender);

        if (newCoordinator != address(0)) {
            s_vrfCoordinator = IVRFCoordinatorV2Plus(newCoordinator);
            emit CoordinatorSet(newCoordinator);
        }

        if (newSubscriptionId > 0) {
            subscriptionId = newSubscriptionId;
            emit SubscriptionIdSet(newSubscriptionId);
        }
    }
}
