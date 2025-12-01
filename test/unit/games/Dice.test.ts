import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther, zeroAddress } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';

describe('Dice Contract', function () {
  async function deployDiceFixture() {
    const [deployer, user, , , , , , administrator, owner1, owner2] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
    const owners = [owner1, owner2];

    const ownersMultisigImpl = await hre.viem.deployContract('MultisigWallet');
    const ownersMultisigImplInitData = encodeFunctionData({
      abi: ownersMultisigImpl.abi,
      functionName: 'initialize',
      args: [BigInt(owners.length), owners.map(owner => owner.account.address)],
    });
    const ownersMultisigProxy = await hre.viem.deployContract('ERC1967Proxy', [
      ownersMultisigImpl.address,
      ownersMultisigImplInitData,
    ]);
    const ownersMultisig = await hre.viem.getContractAt(
      'MultisigWallet',
      ownersMultisigProxy.address,
    );

    await impersonateAccount(ownersMultisig.address);
    await setBalance(ownersMultisig.address, parseEther('100'));

    const accessRolesImpl = await hre.viem.deployContract('AccessRoles');
    const accessRolesInitData = encodeFunctionData({
      abi: accessRolesImpl.abi,
      functionName: 'initialize',
      args: [ownersMultisig.address, [administrator.account.address]],
    });
    const accessRolesProxy = await hre.viem.deployContract('ERC1967Proxy', [
      accessRolesImpl.address,
      accessRolesInitData,
    ]);
    const accessRoles = await hre.viem.getContractAt('AccessRoles', accessRolesProxy.address);

    const addressBookImpl = await hre.viem.deployContract('AddressBook');
    const addressBookInitData = encodeFunctionData({
      abi: addressBookImpl.abi,
      functionName: 'initialize',
      args: [accessRoles.address],
    });
    const addressBookProxy = await hre.viem.deployContract('ERC1967Proxy', [
      addressBookImpl.address,
      addressBookInitData,
    ]);
    const addressBook = await hre.viem.getContractAt('AddressBook', addressBookProxy.address);

    const gameManagerImpl = await hre.viem.deployContract('GameManager');
    const gameManagerInitData = encodeFunctionData({
      abi: gameManagerImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address],
    });
    const gameManagerProxy = await hre.viem.deployContract('ERC1967Proxy', [
      gameManagerImpl.address,
      gameManagerInitData,
    ]);
    const gameManager = await hre.viem.getContractAt('GameManager', gameManagerProxy.address);

    await addressBook.write.initialSetGameManager([gameManager.address], {
      account: deployer.account.address,
    });

    // Deploy MockERC20 token
    const mockToken = await hre.viem.deployContract('MockERC20', ['Mock Token', 'MTK', 18]);
    await mockToken.write.mint([user.account.address, parseEther('1000')]);

    // Deploy Pricers for native token and ERC20 token
    const nativePricerImpl = await hre.viem.deployContract('Pricer');
    const nativePricerInitData = encodeFunctionData({
      abi: nativePricerImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address, 50000000000n, 'ETH/USD Pricer'], // $500 with 8 decimals
    });
    const nativePricerProxy = await hre.viem.deployContract('ERC1967Proxy', [
      nativePricerImpl.address,
      nativePricerInitData,
    ]);
    const nativePricer = await hre.viem.getContractAt('Pricer', nativePricerProxy.address);

    const tokenPricerImpl = await hre.viem.deployContract('Pricer');
    const tokenPricerInitData = encodeFunctionData({
      abi: tokenPricerImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address, 100000000n, 'MTK/USD Pricer'], // $1 with 8 decimals
    });
    const tokenPricerProxy = await hre.viem.deployContract('ERC1967Proxy', [
      tokenPricerImpl.address,
      tokenPricerInitData,
    ]);
    const tokenPricer = await hre.viem.getContractAt('Pricer', tokenPricerProxy.address);

    // Deploy TokensManager
    const tokensManagerImpl = await hre.viem.deployContract('TokensManager');
    const tokensManagerInitData = encodeFunctionData({
      abi: tokensManagerImpl.abi,
      functionName: 'initialize',
      args: [
        addressBook.address,
        [zeroAddress, mockToken.address],
        [nativePricer.address, tokenPricer.address],
      ],
    });
    const tokensManagerProxy = await hre.viem.deployContract('ERC1967Proxy', [
      tokensManagerImpl.address,
      tokensManagerInitData,
    ]);
    const tokensManager = await hre.viem.getContractAt('TokensManager', tokensManagerProxy.address);

    await addressBook.write.initialSetTokensManager([tokensManager.address], {
      account: deployer.account.address,
    });

    const MockVRFCoordinator = await hre.viem.deployContract('MockVRFCoordinator', []);
    const DiceImpl = await hre.viem.deployContract('Dice', [MockVRFCoordinator.address]);
    const diceInitData = encodeFunctionData({
      abi: DiceImpl.abi,
      functionName: 'initialize',
      args: [
        MockVRFCoordinator.address,
        1n,
        '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
        addressBook.address,
        10,
        90,
        parseEther('0.001'),
        parseEther('1'),
        10,
      ],
    });
    const DiceProxy = await hre.viem.deployContract('ERC1967Proxy', [
      DiceImpl.address,
      diceInitData,
    ]);
    const Dice = await hre.viem.getContractAt('Dice', DiceProxy.address);
    await setBalance(Dice.address, parseEther('100'));

    // Mint some tokens to the Dice contract for payouts
    await mockToken.write.mint([Dice.address, parseEther('100')]);

    await gameManager.write.addGame([Dice.address], {
      account: ownersMultisig.address,
    });

    const pauseManagerImpl = await hre.viem.deployContract('PauseManager');
    const pauseManagerInitData = encodeFunctionData({
      abi: pauseManagerImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address],
    });
    const pauseManagerProxy = await hre.viem.deployContract('ERC1967Proxy', [
      pauseManagerImpl.address,
      pauseManagerInitData,
    ]);
    const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerProxy.address);

    await addressBook.write.initialSetPauseManager([pauseManager.address], {
      account: deployer.account.address,
    });

    // Deploy Treasury
    const treasuryImpl = await hre.viem.deployContract('Treasury');
    const treasuryInitData = encodeFunctionData({
      abi: treasuryImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address],
    });
    const treasuryProxy = await hre.viem.deployContract('ERC1967Proxy', [
      treasuryImpl.address,
      treasuryInitData,
    ]);
    const treasury = await hre.viem.getContractAt('Treasury', treasuryProxy.address);

    // Deploy ReferralProgram
    const referralProgramImpl = await hre.viem.deployContract('ReferralProgram');
    const initialReferralPercent = 500n; // 5% (500/10000)
    const referralProgramInitData = encodeFunctionData({
      abi: referralProgramImpl.abi,
      functionName: 'initialize',
      args: [addressBook.address, initialReferralPercent],
    });
    const referralProgramProxy = await hre.viem.deployContract('ERC1967Proxy', [
      referralProgramImpl.address,
      referralProgramInitData,
    ]);
    const referralProgram = await hre.viem.getContractAt(
      'ReferralProgram',
      referralProgramProxy.address,
    );

    await addressBook.write.initialSetTreasury([treasury.address], {
      account: deployer.account.address,
    });
    await addressBook.write.initialSetReferralProgram([referralProgram.address], {
      account: deployer.account.address,
    });

    for (const owner of [owner1, owner2]) {
      const isSigner = await ownersMultisig.read.signers([owner.account.address]);
      expect(isSigner).to.be.true;

      await setBalance(owner.account.address, parseEther('100'));
    }

    return {
      publicClient,
      Dice,
      MockVRFCoordinator,
      accessRoles,
      addressBook,
      gameManager,
      ownersMultisig,
      administrator,
      user,
      owner1,
      owner2,
      deployer,
      treasury,
      mockToken,
      tokensManager,
      zeroAddress, // NATIVE_TOKEN
    };
  }

  describe('Deployment', function () {
    it('Should deploy successfully', async function () {
      const { Dice } = await loadFixture(deployDiceFixture);
      expect(Dice.address).to.not.equal(0);
    });

    it('Should be registered in GameManager', async function () {
      const { Dice, gameManager } = await loadFixture(deployDiceFixture);

      const isRegistered = await gameManager.read.isGameExist([Dice.address]);
      expect(isRegistered).to.be.true;
    });
  });

  describe('Roll Function', function () {
    it('Should emit DiceRollRequested event when roll is called with native token', async function () {
      const { Dice, user, zeroAddress } = await loadFixture(deployDiceFixture);
      const txHash = await Dice.write.roll([50n, 0, zeroAddress, 0n], {
        account: user.account.address,
        value: 1000000000000000n,
      });
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Dice.getEvents.DiceRollRequested(
        {
          roller: user.account.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      );

      expect(events.length).to.equal(1);
      const roller = events[0].args.roller;
      if (!roller) throw new Error('roller is undefined');

      expect(getAddress(roller)).to.equal(getAddress(user.account.address));
      expect(events[0].args.token).to.equal(zeroAddress);
    });

    it('Should emit DiceRollRequested event when roll is called with ERC20 token', async function () {
      const { Dice, user, mockToken } = await loadFixture(deployDiceFixture);

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, 1000000000000000n], {
        account: user.account.address,
      });

      const txHash = await Dice.write.roll([50n, 0, mockToken.address, 1000000000000000n], {
        account: user.account.address,
      });

      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Dice.getEvents.DiceRollRequested(
        {
          roller: user.account.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      );

      expect(events.length).to.equal(1);
      const roller = events[0].args.roller;
      const token = events[0].args.token;

      if (!roller) throw new Error('roller is undefined');
      if (!token) throw new Error('token is undefined');

      expect(getAddress(roller)).to.equal(getAddress(user.account.address));
      expect(getAddress(token)).to.equal(getAddress(mockToken.address));
    });

    it('Should revert if the game is not registered in GameManager', async function () {
      const MockVRFCoordinator = await hre.viem.deployContract('MockVRFCoordinator', []);
      const { user, addressBook, zeroAddress } = await loadFixture(deployDiceFixture);
      const UnregisteredDiceImpl = await hre.viem.deployContract('Dice', [
        MockVRFCoordinator.address,
      ]);
      const diceInitData = encodeFunctionData({
        abi: UnregisteredDiceImpl.abi,
        functionName: 'initialize',
        args: [
          MockVRFCoordinator.address,
          1n,
          '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
          addressBook.address,
          10,
          90,
          parseEther('0.001'),
          parseEther('1'),
          10,
        ],
      });
      const UnregisteredDiceProxy = await hre.viem.deployContract('ERC1967Proxy', [
        UnregisteredDiceImpl.address,
        diceInitData,
      ]);
      const UnregisteredDice = await hre.viem.getContractAt('Dice', UnregisteredDiceProxy.address);
      await setBalance(UnregisteredDice.address, parseEther('100'));

      await expect(
        UnregisteredDice.write.roll([50n, 0, zeroAddress, 0n], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith("Game doesn't exist in GameManager");
    });

    it('Should revert if a roll is already in progress with native token', async function () {
      const { Dice, user, zeroAddress } = await loadFixture(deployDiceFixture);

      await Dice.write.roll([50n, 0, zeroAddress, 0n], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      await expect(
        Dice.write.roll([50n, 0, zeroAddress, 0n], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith('RollInProgress');
    });

    it('Should revert if a roll is already in progress with ERC20 token', async function () {
      const { Dice, user, mockToken } = await loadFixture(deployDiceFixture);

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, 2000000000000000n], {
        account: user.account.address,
      });

      await Dice.write.roll([50n, 0, mockToken.address, 1000000000000000n], {
        account: user.account.address,
      });

      await expect(
        Dice.write.roll([50n, 0, mockToken.address, 1000000000000000n], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('RollInProgress');
    });
  });

  describe('Payout Calculation', function () {
    it('Should correctly calculate payout for GREATER_THAN bet', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 0;

      const payout = await Dice.read.calculatePayout([betAmount, targetNumber, comparisonType], {
        account: user.account.address,
      });

      // For GREATER_THAN with targetNumber 50, probability is 50%
      // House edge = 10%
      // Payout = (betAmount * (100 - 10)) / 50 = (betAmount * 90) / 50
      const expectedPayout = (betAmount * 90n) / 50n;
      expect(payout).to.equal(expectedPayout);
    });

    it('Should correctly calculate payout for LESS_THAN bet', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 1; // LESS_THAN

      const payout = await Dice.read.calculatePayout([betAmount, targetNumber, comparisonType], {
        account: user.account.address,
      });

      // For LESS_THAN with targetNumber 50, probability is 49%
      // House edge = 10%
      // Payout = (betAmount * (100 - 10)) / 49 = (betAmount * 90) / 49
      const expectedPayout = (betAmount * 90n) / 49n;
      expect(payout).to.equal(expectedPayout);
    });

    it('Should revert for invalid target number (probability = 0)', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;

      await expect(
        Dice.read.calculatePayout([betAmount, 100n, 0], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('InvalidTargetNumber');

      await expect(
        Dice.read.calculatePayout([betAmount, 1n, 1], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('InvalidTargetNumber');
    });
  });

  describe('Bet Information', function () {
    it('Should return empty bet details when no bet has been placed', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const bet = await Dice.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(0n);
      expect(bet[1]).to.equal(0n);
      expect(bet[2]).to.equal(0);
      expect(bet[3]).to.be.false;
      expect(bet[4]).to.be.false;
      expect(bet[5]).to.equal(0n);
    });

    it('Should return correct bet details after placing a native token bet', async function () {
      const { Dice, user, zeroAddress } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 0;

      await Dice.write.roll([targetNumber, comparisonType, zeroAddress, 0n], {
        account: user.account.address,
        value: betAmount,
      });

      const bet = await Dice.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetNumber);
      expect(bet[2]).to.equal(comparisonType);
      expect(bet[3]).to.be.false;
      expect(bet[4]).to.be.false;

      const calculatedPayout = await Dice.read.calculatePayout(
        [betAmount, targetNumber, comparisonType],
        {
          account: user.account.address,
        },
      );
      expect(bet[5]).to.equal(calculatedPayout);
    });

    it('Should return correct bet details after placing an ERC20 token bet', async function () {
      const { Dice, user, mockToken } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 0;

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await Dice.write.roll([targetNumber, comparisonType, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const bet = await Dice.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetNumber);
      expect(bet[2]).to.equal(comparisonType);
      expect(bet[3]).to.be.false;
      expect(bet[4]).to.be.false;

      const calculatedPayout = await Dice.read.calculatePayout(
        [betAmount, targetNumber, comparisonType],
        {
          account: user.account.address,
        },
      );
      expect(bet[5]).to.equal(calculatedPayout);
    });

    it('Should update bet details after fulfillment with native token', async function () {
      const { Dice, MockVRFCoordinator, user, zeroAddress } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 0;

      await Dice.write.roll([targetNumber, comparisonType, zeroAddress, 0n], {
        account: user.account.address,
        value: betAmount,
      });

      const randomWord = 74n;
      const randomWords = [randomWord];

      await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, randomWords], {
        account: user.account.address,
      });

      const bet = await Dice.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetNumber);
      expect(bet[2]).to.equal(comparisonType);
      expect(bet[3]).to.be.true;
      expect(bet[4]).to.be.true;
    });

    it('Should update bet details after fulfillment with ERC20 token', async function () {
      const { Dice, MockVRFCoordinator, user, mockToken } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;
      const targetNumber = 50n;
      const comparisonType = 0;

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await Dice.write.roll([targetNumber, comparisonType, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const randomWord = 74n;
      const randomWords = [randomWord];

      await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, randomWords], {
        account: user.account.address,
      });

      const bet = await Dice.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetNumber);
      expect(bet[2]).to.equal(comparisonType);
      expect(bet[3]).to.be.true;
      expect(bet[4]).to.be.true;
    });
  });

  describe('Contract Balance', function () {
    it('Should return the correct contract balance', async function () {
      const { Dice, publicClient } = await loadFixture(deployDiceFixture);

      const contractBalance = await Dice.read.getContractBalance();
      const actualBalance = await publicClient.getBalance({ address: Dice.address });

      expect(contractBalance).to.equal(actualBalance);
    });

    it('Should update contract balance after receiving a native token bet', async function () {
      const { Dice, user, zeroAddress } = await loadFixture(deployDiceFixture);

      const initialBalance = await Dice.read.getContractBalance();
      const betAmount = 1000000000000000n;

      await Dice.write.roll([50n, 0, zeroAddress, 0n], {
        account: user.account.address,
        value: betAmount,
      });

      const newBalance = await Dice.read.getContractBalance();
      expect(newBalance).to.equal(initialBalance + betAmount);
    });

    it('Should not change contract ETH balance after receiving an ERC20 token bet', async function () {
      const { Dice, user, mockToken } = await loadFixture(deployDiceFixture);

      const initialBalance = await Dice.read.getContractBalance();
      const betAmount = 1000000000000000n;

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await Dice.write.roll([50n, 0, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const newBalance = await Dice.read.getContractBalance();
      expect(newBalance).to.equal(initialBalance); // ETH balance should not change
    });

    it('Should update ERC20 token balance after receiving an ERC20 token bet', async function () {
      const { Dice, user, mockToken } = await loadFixture(deployDiceFixture);

      // Get initial token balance of the Dice contract
      const initialTokenBalance = await mockToken.read.balanceOf([Dice.address]);
      const betAmount = 1000000000000000n;

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await Dice.write.roll([50n, 0, mockToken.address, betAmount], {
        account: user.account.address,
      });

      // Get new token balance of the Dice contract
      const newTokenBalance = await mockToken.read.balanceOf([Dice.address]);
      expect(newTokenBalance).to.equal(initialTokenBalance + betAmount);
    });
  });

  describe('Roll Result', function () {
    it('Should return 0 if no roll has been made', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(0n);
    });

    it('Should return 0 if a native token roll is in progress', async function () {
      const { Dice, user, zeroAddress } = await loadFixture(deployDiceFixture);

      await Dice.write.roll([50n, 0, zeroAddress, 0n], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(0n);
    });

    it('Should return 0 if an ERC20 token roll is in progress', async function () {
      const { Dice, user, mockToken } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await Dice.write.roll([50n, 0, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(0n);
    });

    it('Should correctly identify when a native token roll is in progress', async function () {
      const { Dice, user, zeroAddress } = await loadFixture(deployDiceFixture);
      const beforeRoll = await Dice.read.isRollInProgress({
        account: user.account.address,
      });

      expect(beforeRoll).to.be.false;

      await Dice.write.roll([50n, 0, zeroAddress, 0n], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      const afterRoll = await Dice.read.isRollInProgress({
        account: user.account.address,
      });

      expect(afterRoll).to.be.true;
    });

    it('Should correctly identify when an ERC20 token roll is in progress', async function () {
      const { Dice, user, mockToken } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;

      const beforeRoll = await Dice.read.isRollInProgress({
        account: user.account.address,
      });

      expect(beforeRoll).to.be.false;

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await Dice.write.roll([50n, 0, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const afterRoll = await Dice.read.isRollInProgress({
        account: user.account.address,
      });

      expect(afterRoll).to.be.true;
    });

    it('Should correctly calculate and store roll result after fulfillment with native token', async function () {
      const { Dice, MockVRFCoordinator, user, zeroAddress } = await loadFixture(deployDiceFixture);

      await Dice.write.roll([50n, 0, zeroAddress, 0n], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      const randomWord = 26n;
      const randomWords = [randomWord];
      await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, randomWords], {
        account: user.account.address,
      });

      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(27n);

      const rollInProgress = await Dice.read.isRollInProgress({
        account: user.account.address,
      });
      expect(rollInProgress).to.be.false;
    });

    it('Should correctly calculate and store roll result after fulfillment with ERC20 token', async function () {
      const { Dice, MockVRFCoordinator, user, mockToken } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await Dice.write.roll([50n, 0, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const randomWord = 26n;
      const randomWords = [randomWord];
      await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, randomWords], {
        account: user.account.address,
      });

      const result = await Dice.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(27n);

      const rollInProgress = await Dice.read.isRollInProgress({
        account: user.account.address,
      });
      expect(rollInProgress).to.be.false;
    });

    it('Should emit DiceRollFulfilled event when random words are fulfilled with native token', async function () {
      const { Dice, MockVRFCoordinator, user, zeroAddress } = await loadFixture(deployDiceFixture);

      await Dice.write.roll([50n, 0, zeroAddress, 0n], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      const randomWords = [123456789n];
      const diceAddress = Dice.address;

      const txHash = await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account: user.account.address,
      });
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Dice.getEvents.DiceRollFulfilled(
        {
          roller: user.account.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      );

      expect(events.length).to.equal(1);

      const roller = events[0].args.roller;
      if (!roller) throw new Error('roller is undefined');
      expect(getAddress(roller)).to.equal(getAddress(user.account.address));

      const expectedResult = (123456789n % 100n) + 1n;
      expect(events[0].args.result).to.equal(expectedResult);
      expect(events[0].args.token).to.equal(zeroAddress);
    });

    it('Should emit DiceRollFulfilled event when random words are fulfilled with ERC20 token', async function () {
      const { Dice, MockVRFCoordinator, user, mockToken } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await Dice.write.roll([50n, 0, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const randomWords = [123456789n];
      const diceAddress = Dice.address;

      const txHash = await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account: user.account.address,
      });
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Dice.getEvents.DiceRollFulfilled(
        {
          roller: user.account.address,
        },
        {
          blockHash: receipt.blockHash,
        },
      );

      expect(events.length).to.equal(1);

      const roller = events[0].args.roller;
      const token = events[0].args.token;

      if (!roller) throw new Error('roller is undefined');
      if (!token) throw new Error('token is undefined');

      expect(getAddress(roller)).to.equal(getAddress(user.account.address));

      const expectedResult = (123456789n % 100n) + 1n;
      expect(events[0].args.result).to.equal(expectedResult);
      expect(getAddress(token)).to.equal(getAddress(mockToken.address));
    });
  });
  describe('Pause Integration', function () {
    it('Should revert when PauseManager is paused with native token', async function () {
      const { Dice, user, administrator, addressBook, zeroAddress } = await loadFixture(deployDiceFixture);

      const pauseManagerAddress = await addressBook.read.pauseManager();
      const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerAddress);

      const accessRolesAddress = await addressBook.read.accessRoles();
      const accessRoles = await hre.viem.getContractAt('AccessRoles', accessRolesAddress);

      await setBalance(administrator.account.address, parseEther('1'));

      await pauseManager.write.pauseContract([Dice.address], {
        account: administrator.account,
      });

      await expect(
        Dice.write.roll([50n, 0, zeroAddress, 0n], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith('paused!');
    });

    it('Should revert when PauseManager is paused with ERC20 token', async function () {
      const { Dice, user, administrator, addressBook, mockToken } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;

      const pauseManagerAddress = await addressBook.read.pauseManager();
      const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerAddress);

      const accessRolesAddress = await addressBook.read.accessRoles();
      const accessRoles = await hre.viem.getContractAt('AccessRoles', accessRolesAddress);

      await setBalance(administrator.account.address, parseEther('1'));

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await pauseManager.write.pauseContract([Dice.address], {
        account: administrator.account,
      });

      await expect(
        Dice.write.roll([50n, 0, mockToken.address, betAmount], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('paused!');
    });

    it('Should revert when specific contract is paused in PauseManager with native token', async function () {
      const { Dice, user, administrator, addressBook, zeroAddress } = await loadFixture(deployDiceFixture);
      const pauseManagerAddress = await addressBook.read.pauseManager();
      const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerAddress);

      await setBalance(administrator.account.address, parseEther('1'));
      await pauseManager.write.pauseContract([Dice.address], {
        account: administrator.account,
      });

      await expect(
        Dice.write.roll([50n, 0, zeroAddress, 0n], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith('paused!');
    });

    it('Should revert when specific contract is paused in PauseManager with ERC20 token', async function () {
      const { Dice, user, administrator, addressBook, mockToken } = await loadFixture(deployDiceFixture);
      const betAmount = 1000000000000000n;

      const pauseManagerAddress = await addressBook.read.pauseManager();
      const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerAddress);

      await setBalance(administrator.account.address, parseEther('1'));

      // Approve the Dice contract to spend tokens
      await mockToken.write.approve([Dice.address, betAmount], {
        account: user.account.address,
      });

      await pauseManager.write.pauseContract([Dice.address], {
        account: administrator.account,
      });

      await expect(
        Dice.write.roll([50n, 0, mockToken.address, betAmount], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('paused!');
    });
  });

  describe('Configuration Functions', function () {
    it('Should allow owners multisig to set minimum bet value', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const initialMinBetValue = await Dice.read.minBetValue();
      const newMinBetValue = initialMinBetValue + 1;

      await Dice.write.setMinBetValue([newMinBetValue], {
        account: ownersMultisig.address,
      });

      const updatedMinBetValue = await Dice.read.minBetValue();
      expect(updatedMinBetValue).to.equal(newMinBetValue);
    });

    it('Should allow owners multisig to update VRF Coordinator', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const newCoordinator = '0x1234567890123456789012345678901234567890';

      await Dice.write.updateVRFSettings([newCoordinator, 0n], {
        account: ownersMultisig.address,
      });

      // We can't directly check the s_vrfCoordinator as it's a private variable
      // But we can verify the transaction succeeded
      // This is similar to how other configuration tests are structured
    });

    it('Should allow owners multisig to update subscription ID', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const newSubscriptionId = 42n;

      await Dice.write.updateVRFSettings([zeroAddress, newSubscriptionId], {
        account: ownersMultisig.address,
      });

      // We can't directly check the subscriptionId as it's a private variable
      // But we can verify the transaction succeeded
      // This is similar to how other configuration tests are structured
    });

    it('Should allow owners multisig to update both VRF Coordinator and subscription ID', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const newCoordinator = '0x1234567890123456789012345678901234567890';
      const newSubscriptionId = 42n;

      await Dice.write.updateVRFSettings([newCoordinator, newSubscriptionId], {
        account: ownersMultisig.address,
      });

      // We can't directly check the private variables
      // But we can verify the transaction succeeded
    });

    it('Should prevent non-owners from updating VRF settings', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);
      const newCoordinator = '0x1234567890123456789012345678901234567890';
      const newSubscriptionId = 42n;

      await expect(
        Dice.write.updateVRFSettings([newCoordinator, newSubscriptionId], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should prevent setting invalid minimum bet value', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const maxBetValue = await Dice.read.maxBetValue();

      await expect(
        Dice.write.setMinBetValue([0], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('InvalidMinBetValue');

      await expect(
        Dice.write.setMinBetValue([maxBetValue], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('MinGreaterThanMax');

      await expect(
        Dice.write.setMinBetValue([maxBetValue + 1], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('MinGreaterThanMax');
    });

    it('Should allow owners multisig to set maximum bet value', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const newMaxBetValue = 95;

      await Dice.write.setMaxBetValue([newMaxBetValue], {
        account: ownersMultisig.address,
      });

      const updatedMaxBetValue = await Dice.read.maxBetValue();
      expect(updatedMaxBetValue).to.equal(newMaxBetValue);
    });

    it('Should prevent setting invalid maximum bet value', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const minBetValue = await Dice.read.minBetValue();

      await expect(
        Dice.write.setMaxBetValue([101], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('InvalidMaxBetValue');

      await expect(
        Dice.write.setMaxBetValue([minBetValue], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('MinGreaterThanMax');

      await expect(
        Dice.write.setMaxBetValue([minBetValue - 1], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('MinGreaterThanMax');
    });

    it('Should allow owners multisig to set minimum bet amount', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const initialMinBetAmount = await Dice.read.minBetAmount();
      const newMinBetAmount = initialMinBetAmount + parseEther('0.001');

      await Dice.write.setMinBetAmount([newMinBetAmount], {
        account: ownersMultisig.address,
      });

      const updatedMinBetAmount = await Dice.read.minBetAmount();
      expect(updatedMinBetAmount).to.equal(newMinBetAmount);
    });

    it('Should prevent setting invalid minimum bet amount', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const maxBetAmount = await Dice.read.maxBetAmount();

      await expect(
        Dice.write.setMinBetAmount([0n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('InvalidMinBetAmount');

      await expect(
        Dice.write.setMinBetAmount([maxBetAmount], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('MinGreaterThanMax');

      await expect(
        Dice.write.setMinBetAmount([maxBetAmount + 1n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('MinGreaterThanMax');
    });

    it('Should allow owners multisig to set maximum bet amount', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const initialMaxBetAmount = await Dice.read.maxBetAmount();
      const newMaxBetAmount = initialMaxBetAmount + parseEther('1');

      await Dice.write.setMaxBetAmount([newMaxBetAmount], {
        account: ownersMultisig.address,
      });

      const updatedMaxBetAmount = await Dice.read.maxBetAmount();

      expect(updatedMaxBetAmount).to.equal(newMaxBetAmount);
    });

    it('Should prevent setting invalid maximum bet amount', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const minBetAmount = await Dice.read.minBetAmount();

      await expect(
        Dice.write.setMaxBetAmount([minBetAmount], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('MinGreaterThanMax');

      await expect(
        Dice.write.setMaxBetAmount([minBetAmount - 1n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('MinGreaterThanMax');
    });

    it('Should allow owners multisig to set house edge', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const initialHouseEdge = await Dice.read.houseEdge();
      const newHouseEdge = initialHouseEdge + 5;

      await Dice.write.setHouseEdge([newHouseEdge], {
        account: ownersMultisig.address,
      });

      const updatedHouseEdge = await Dice.read.houseEdge();

      expect(updatedHouseEdge).to.equal(newHouseEdge);
    });

    it('Should prevent setting invalid house edge', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.setHouseEdge([51], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('InvalidHouseEdge');
    });

    it('Should prevent non-owners from changing configuration', async function () {
      const { Dice, user } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.setMinBetValue([5], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setMaxBetValue([95], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setMinBetAmount([parseEther('0.002')], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setMaxBetAmount([parseEther('2')], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setHouseEdge([15], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Dice.write.setCallbackGasLimit([100000], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should allow owners multisig to set callback gas limit', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);
      const newGasLimit = 150000;

      await Dice.write.setCallbackGasLimit([newGasLimit], {
        account: ownersMultisig.address,
      });

      // We can't directly check the callbackGasLimit as it's a private variable
      // But we can verify the transaction succeeded
      // This is similar to how other configuration tests are structured
    });

    it('Should prevent setting invalid callback gas limit', async function () {
      const { Dice, ownersMultisig } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.setCallbackGasLimit([50000], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Gas limit too low');

      await expect(
        Dice.write.setCallbackGasLimit([0], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Gas limit too low');
    });
  });

  describe('Withdraw to Treasury', function () {
    it('Should allow administrators to withdraw native tokens to treasury', async function () {
      const { Dice, administrator, treasury, publicClient, zeroAddress } = await loadFixture(deployDiceFixture);

      const initialDiceBalance = await Dice.read.getContractBalance();
      const initialTreasuryBalance = await publicClient.getBalance({ address: treasury.address });

      const withdrawAmount = parseEther('1');

      await Dice.write.withdrawToTreasury([zeroAddress, withdrawAmount], {
        account: administrator.account.address,
      });

      const finalDiceBalance = await Dice.read.getContractBalance();
      const finalTreasuryBalance = await publicClient.getBalance({ address: treasury.address });

      expect(finalDiceBalance).to.equal(initialDiceBalance - withdrawAmount);
      expect(finalTreasuryBalance).to.equal(initialTreasuryBalance + withdrawAmount);
    });

    it('Should allow administrators to withdraw ERC20 tokens to treasury', async function () {
      const { Dice, administrator, treasury, mockToken } = await loadFixture(deployDiceFixture);

      // Get initial token balances
      const initialDiceTokenBalance = await mockToken.read.balanceOf([Dice.address]);
      const initialTreasuryTokenBalance = await mockToken.read.balanceOf([treasury.address]);

      const withdrawAmount = parseEther('1');

      await Dice.write.withdrawToTreasury([mockToken.address, withdrawAmount], {
        account: administrator.account.address,
      });

      // Get final token balances
      const finalDiceTokenBalance = await mockToken.read.balanceOf([Dice.address]);
      const finalTreasuryTokenBalance = await mockToken.read.balanceOf([treasury.address]);

      expect(finalDiceTokenBalance).to.equal(initialDiceTokenBalance - withdrawAmount);
      expect(finalTreasuryTokenBalance).to.equal(initialTreasuryTokenBalance + withdrawAmount);
    });

    it('Should revert if non-administrator tries to withdraw native tokens', async function () {
      const { Dice, user, zeroAddress } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.withdrawToTreasury([zeroAddress, parseEther('1')], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should revert if non-administrator tries to withdraw ERC20 tokens', async function () {
      const { Dice, user, mockToken } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.withdrawToTreasury([mockToken.address, parseEther('1')], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should revert if withdrawal amount is zero for native tokens', async function () {
      const { Dice, administrator, zeroAddress } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.withdrawToTreasury([zeroAddress, 0n], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('_amount is zero!');
    });

    it('Should revert if withdrawal amount is zero for ERC20 tokens', async function () {
      const { Dice, administrator, mockToken } = await loadFixture(deployDiceFixture);

      await expect(
        Dice.write.withdrawToTreasury([mockToken.address, 0n], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('_amount is zero!');
    });

    it('Should revert if withdrawal amount exceeds contract balance for native tokens', async function () {
      const { Dice, administrator, zeroAddress } = await loadFixture(deployDiceFixture);

      const contractBalance = await Dice.read.getContractBalance();
      const excessiveAmount = contractBalance + 1n;

      await expect(
        Dice.write.withdrawToTreasury([zeroAddress, excessiveAmount], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('InsufficientContractBalance');
    });

    it('Should revert if withdrawal amount exceeds contract balance for ERC20 tokens', async function () {
      const { Dice, administrator, mockToken } = await loadFixture(deployDiceFixture);

      const tokenBalance = await mockToken.read.balanceOf([Dice.address]);
      const excessiveAmount = tokenBalance + 1n;

      await expect(
        Dice.write.withdrawToTreasury([mockToken.address, excessiveAmount], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('InsufficientContractBalance');
    });
  });
});
