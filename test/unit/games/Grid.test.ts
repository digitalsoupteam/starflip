import { expect } from 'chai';
import hre from 'hardhat';
import {
  encodeFunctionData,
  getAddress,
  parseEther,
  zeroAddress,
} from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';

import {deriveWinningCellsFromRandomViem} from '../../../utils/utils';

describe('Grid Contract', function () {
  async function deployGridFixture() {
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
      args: [addressBook.address, 50000000000n, 'ETH/USD Pricer'],
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
      args: [addressBook.address, 100000000n, 'MTK/USD Pricer'],
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
    const GridImpl = await hre.viem.deployContract('Grid', [MockVRFCoordinator.address]);
    const gridInitData = encodeFunctionData({
      abi: GridImpl.abi,
      functionName: 'initialize',
      args: [
        MockVRFCoordinator.address,
        1n,
        '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
        addressBook.address,
        parseEther('0.001'),
        parseEther('1'),
        10,
      ],
    });
    const GridProxy = await hre.viem.deployContract('ERC1967Proxy', [
      GridImpl.address,
      gridInitData,
    ]);
    const Grid = await hre.viem.getContractAt('Grid', GridProxy.address);
    await setBalance(Grid.address, parseEther('100'));

    // Mint some tokens to the Grid contract for payouts
    await mockToken.write.mint([Grid.address, parseEther('100')]);

    await gameManager.write.addGame([Grid.address], {
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
      Grid,
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
      zeroAddress,
    };
  }

  describe('Deployment', function () {
    it('Should deploy successfully', async function () {
      const { Grid } = await loadFixture(deployGridFixture);
      expect(Grid.address).to.not.equal(0);
    });

    it('Should be registered in GameManager', async function () {
      const { Grid, gameManager } = await loadFixture(deployGridFixture);

      const isRegistered = await gameManager.read.isGameExist([Grid.address]);
      expect(isRegistered).to.be.true;
    });
  });

  describe('Roll Function', function () {
    it('Should emit GridRollRequested event when roll is called with native token', async function () {
      const { Grid, user, zeroAddress } = await loadFixture(deployGridFixture);
      const txHash = await Grid.write.roll([0b0000000000000000000011111, zeroAddress, 0n], {
        account: user.account.address,
        value: 1000000000000000n,
      });
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Grid.getEvents.GridRollRequested(
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

    it('Should emit GridRollRequested event when roll is called with ERC20 token', async function () {
      const { Grid, user, mockToken } = await loadFixture(deployGridFixture);

      await mockToken.write.approve([Grid.address, 1000000000000000n], {
        account: user.account.address,
      });

      const txHash = await Grid.write.roll([0b0000000000000000000011111, mockToken.address, 1000000000000000n], {
        account: user.account.address,
      });

      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Grid.getEvents.GridRollRequested(
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
      const { user, addressBook, zeroAddress } = await loadFixture(deployGridFixture);
      const UnregisteredGridImpl = await hre.viem.deployContract('Grid', [
        MockVRFCoordinator.address,
      ]);
      const gridInitData = encodeFunctionData({
        abi: UnregisteredGridImpl.abi,
        functionName: 'initialize',
        args: [
          MockVRFCoordinator.address,
          1n,
          '0x8af398995b04c28e9a51adb9721ef74c74f93e6a478f39e7e0777be13527e7ef',
          addressBook.address,
          parseEther('0.001'),
          parseEther('1'),
          10,
        ],
      });
      const UnregisteredGridProxy = await hre.viem.deployContract('ERC1967Proxy', [
        UnregisteredGridImpl.address,
        gridInitData,
      ]);
      const UnregisteredGrid = await hre.viem.getContractAt('Grid', UnregisteredGridProxy.address);
      await setBalance(UnregisteredGrid.address, parseEther('100'));

      await expect(
        UnregisteredGrid.write.roll([0b0000000000000000000011111, zeroAddress, 0n], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith("Game doesn't exist in GameManager");
    });

    it('Should revert if a roll is already in progress with native token', async function () {
      const { Grid, user, zeroAddress } = await loadFixture(deployGridFixture);

      await Grid.write.roll([0b0000000000000000000011111, zeroAddress, 0n], {
        account: user.account.address,
        value: 1000000000000000n,
      });

      await expect(
        Grid.write.roll([0b0000000000000000000011111, zeroAddress, 0n], {
          account: user.account.address,
          value: 1000000000000000n,
        }),
      ).to.be.rejectedWith('RollInProgress');
    });

    it('Should revert if a roll is already in progress with ERC20 token', async function () {
      const { Grid, user, mockToken } = await loadFixture(deployGridFixture);

      await mockToken.write.approve([Grid.address, 2000000000000000n], {
        account: user.account.address,
      });

      await Grid.write.roll([0b0000000000000000000011111, mockToken.address, 1000000000000000n], {
        account: user.account.address,
      });
      await expect(
        Grid.write.roll([0b0000000000000000000011111, mockToken.address, 1000000000000000n], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('RollInProgress');
    });
  });

  describe('Payout Calculation', function () {
    it('Should correctly calculate pot', async function () {
      const { Grid, user } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;

      const pot = await Grid.read.calculatePot([betAmount], {
        account: user.account.address,
      });
      const houseEdge = await Grid.read.houseEdge({});
      const expectedPayout = (betAmount * 2n * BigInt(100 - houseEdge)) / 100n;

      expect(pot).to.equal(expectedPayout);
    });
  });

  describe('Bet Information', function () {
    it('Should return empty bet details when no bet has been placed', async function () {
      const { Grid, user } = await loadFixture(deployGridFixture);
      const bet = await Grid.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(0n);
      expect(bet[1]).to.equal(0);
      expect(bet[2]).to.be.false;
      expect(bet[3]).to.be.false;
      expect(bet[4]).to.equal(0n);
    });

    it('Should return correct bet details after placing a native token bet', async function () {
      const { Grid, user, zeroAddress } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await Grid.write.roll([targetCells, zeroAddress, 0n], {
        account: user.account.address,
        value: betAmount,
      });

      const bet = await Grid.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetCells);
      expect(bet[2]).to.be.false;
      expect(bet[3]).to.be.false;
      const calculatedPot = await Grid.read.calculatePot(
        [betAmount],
        {
          account: user.account.address,
        },
      );
      expect(bet[4]).to.equal(calculatedPot);
    });

    it('Should return correct bet details after placing an ERC20 token bet', async function () {
      const { Grid, user, mockToken } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await Grid.write.roll([targetCells, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const bet = await Grid.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetCells);
      expect(bet[2]).to.be.false;
      expect(bet[3]).to.be.false;
      const calculatedPot = await Grid.read.calculatePot(
        [betAmount],
        {
          account: user.account.address,
        },
      );
      expect(bet[4]).to.equal(calculatedPot);
    });

    it('Should update bet details after fulfillment with native token', async function () {
      const { Grid, MockVRFCoordinator, user, zeroAddress } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await Grid.write.roll([targetCells, zeroAddress, 0n], {
        account: user.account.address,
        value: betAmount,
      });

      const randomWords = [72n];

      await MockVRFCoordinator.write.fulfillRandomWords([Grid.address, randomWords], {
        account: user.account.address,
      });

      const bet = await Grid.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetCells);
      expect(bet[3]).to.be.true;
      const calculatedPot = await Grid.read.calculatePot(
        [betAmount],
        {
          account: user.account.address,
        },
      );
      expect(bet[4]).to.equal(calculatedPot);
    });

    it('Should update bet details after fulfillment with ERC20 token', async function () {
      const { Grid, MockVRFCoordinator, user, mockToken } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await Grid.write.roll([targetCells, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const randomWords = [74n];

      await MockVRFCoordinator.write.fulfillRandomWords([Grid.address, randomWords], {
        account: user.account.address,
      });

      const bet = await Grid.read.getCurrentBet({
        account: user.account.address,
      });

      expect(bet[0]).to.equal(betAmount);
      expect(bet[1]).to.equal(targetCells);
      expect(bet[3]).to.be.true;
      const calculatedPot = await Grid.read.calculatePot(
        [betAmount],
        {
          account: user.account.address,
        },
      );
      expect(bet[4]).to.equal(calculatedPot);
    });
  });

  describe('Contract Balance', function () {
    it('Should return the correct contract balance', async function () {
      const { Grid, publicClient } = await loadFixture(deployGridFixture);

      const contractBalance = await Grid.read.getContractBalance();
      const actualBalance = await publicClient.getBalance({ address: Grid.address });

      expect(contractBalance).to.equal(actualBalance);
    });

    it('Should update contract balance after receiving a native token bet', async function () {
      const { Grid, user, zeroAddress } = await loadFixture(deployGridFixture);

      const initialBalance = await Grid.read.getContractBalance();
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await Grid.write.roll([targetCells, zeroAddress, 0n], {
        account: user.account.address,
        value: betAmount,
      });

      const newBalance = await Grid.read.getContractBalance();
      expect(newBalance).to.equal(initialBalance + betAmount);
    });

    it('Should not change contract ETH balance after receiving an ERC20 token bet', async function () {
      const { Grid, user, mockToken } = await loadFixture(deployGridFixture);

      const initialBalance = await Grid.read.getContractBalance();
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await Grid.write.roll([targetCells, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const newBalance = await Grid.read.getContractBalance();
      expect(newBalance).to.equal(initialBalance);
    });

    it('Should update ERC20 token balance after receiving an ERC20 token bet', async function () {
      const { Grid, user, mockToken } = await loadFixture(deployGridFixture);

      const initialTokenBalance = await mockToken.read.balanceOf([Grid.address]);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await Grid.write.roll([targetCells, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const newTokenBalance = await mockToken.read.balanceOf([Grid.address]);
      expect(newTokenBalance).to.equal(initialTokenBalance + betAmount);
    });
  });

  describe('Roll Result', function () {
    it('Should return 0 if no roll has been made', async function () {
      const { Grid, user } = await loadFixture(deployGridFixture);
      const result = await Grid.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(0);
    });

    it('Should return 0 if a native token roll is in progress', async function () {
      const { Grid, user, zeroAddress } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await Grid.write.roll([targetCells, zeroAddress, betAmount], {
        account: user.account.address,
        value: betAmount,
      });

      const result = await Grid.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(0);
    });

    it('Should return 0 if an ERC20 token roll is in progress', async function () {
      const { Grid, user, mockToken } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await Grid.write.roll([targetCells, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const result = await Grid.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(0);
    });

    it('Should correctly identify when a native token roll is in progress', async function () {
      const { Grid, user, zeroAddress } = await loadFixture(deployGridFixture);
      const beforeRoll = await Grid.read.isRollInProgress({
        account: user.account.address,
      });

      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      expect(beforeRoll).to.be.false;

      await Grid.write.roll([targetCells, zeroAddress, betAmount], {
        account: user.account.address,
        value: betAmount,
      });

      const afterRoll = await Grid.read.isRollInProgress({
        account: user.account.address,
      });

      expect(afterRoll).to.be.true;
    });

    it('Should correctly identify when an ERC20 token roll is in progress', async function () {
      const { Grid, user, mockToken } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      const beforeRoll = await Grid.read.isRollInProgress({
        account: user.account.address,
      });

      expect(beforeRoll).to.be.false;

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await Grid.write.roll([targetCells, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const afterRoll = await Grid.read.isRollInProgress({
        account: user.account.address,
      });

      expect(afterRoll).to.be.true;
    });

    it('Should correctly calculate and store roll result after fulfillment with native token', async function () {
      const { Grid, MockVRFCoordinator, user, zeroAddress } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await Grid.write.roll([targetCells, zeroAddress, betAmount], {
        account: user.account.address,
        value: betAmount,
      });

      const randomWords = [123456789n];
      await MockVRFCoordinator.write.fulfillRandomWords([Grid.address, randomWords], {
        account: user.account.address,
      });

      const result = await Grid.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(deriveWinningCellsFromRandomViem(randomWords[0]));

      const rollInProgress = await Grid.read.isRollInProgress({
        account: user.account.address,
      });
      expect(rollInProgress).to.be.false;
    });

    it('Should correctly calculate and store roll result after fulfillment with ERC20 token', async function () {
      const { Grid, MockVRFCoordinator, user, mockToken } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await Grid.write.roll([targetCells, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const randomWord = 26n;
      const randomWords = [randomWord];
      await MockVRFCoordinator.write.fulfillRandomWords([Grid.address, randomWords], {
        account: user.account.address,
      });

      const result = await Grid.read.getLatestRollResult({
        account: user.account.address,
      });

      expect(result).to.equal(deriveWinningCellsFromRandomViem(randomWords[0]));

      const rollInProgress = await Grid.read.isRollInProgress({
        account: user.account.address,
      });
      expect(rollInProgress).to.be.false;
    });

    it('Should emit DiceRollFulfilled event when random words are fulfilled with native token', async function () {
      const { Grid, MockVRFCoordinator, user, zeroAddress } = await loadFixture(deployGridFixture);
      const targetCells = 0b0000000000000000000011111;
      const betAmount = 1000000000000000n;

      await Grid.write.roll([targetCells, zeroAddress, betAmount], {
        account: user.account.address,
        value: betAmount,
      });

      const randomWords = [123456789n];
      const diceAddress = Grid.address;

      const txHash = await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account: user.account.address,
      });
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Grid.getEvents.GridRollFulfilled(
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
      expect(events[0].args.result).to.equal(deriveWinningCellsFromRandomViem(randomWords[0]));
      expect(events[0].args.token).to.equal(zeroAddress);
    });

    it('Should emit DiceRollFulfilled event when random words are fulfilled with ERC20 token', async function () {
      const { Grid, MockVRFCoordinator, user, mockToken } = await loadFixture(deployGridFixture);
      const targetCells = 0b0000000000000000000011111;
      const betAmount = 1000000000000000n;

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await Grid.write.roll([targetCells, mockToken.address, betAmount], {
        account: user.account.address,
      });

      const randomWords = [123456789n];
      const diceAddress = Grid.address;

      const txHash = await MockVRFCoordinator.write.fulfillRandomWords([diceAddress, randomWords], {
        account: user.account.address,
      });
      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const events = await Grid.getEvents.GridRollFulfilled(
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
      expect(events[0].args.result).to.equal(deriveWinningCellsFromRandomViem(randomWords[0]));
      expect(getAddress(token)).to.equal(getAddress(mockToken.address));
    });
  });

  describe('Pause Integration', function () {
    it('Should revert when PauseManager is paused with native token', async function () {
      const { Grid, user, administrator, addressBook, zeroAddress } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      const pauseManagerAddress = await addressBook.read.pauseManager();
      const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerAddress);

      const accessRolesAddress = await addressBook.read.accessRoles();
      const accessRoles = await hre.viem.getContractAt('AccessRoles', accessRolesAddress);

      await setBalance(administrator.account.address, parseEther('1'));

      await pauseManager.write.pauseContract([Grid.address], {
        account: administrator.account,
      });

      await expect(
        Grid.write.roll([targetCells, zeroAddress, betAmount], {
          account: user.account.address,
          value: betAmount,
        }),
      ).to.be.rejectedWith('paused!');
    });

    it('Should revert when PauseManager is paused with ERC20 token', async function () {
      const { Grid, user, administrator, addressBook, mockToken } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      const pauseManagerAddress = await addressBook.read.pauseManager();
      const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerAddress);

      const accessRolesAddress = await addressBook.read.accessRoles();
      const accessRoles = await hre.viem.getContractAt('AccessRoles', accessRolesAddress);

      await setBalance(administrator.account.address, parseEther('1'));

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await pauseManager.write.pauseContract([Grid.address], {
        account: administrator.account,
      });

      await expect(
        Grid.write.roll([targetCells, mockToken.address, betAmount], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('paused!');
    });

    it('Should revert when specific contract is paused in PauseManager with native token', async function () {
      const { Grid, user, administrator, addressBook, zeroAddress } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;
      const pauseManagerAddress = await addressBook.read.pauseManager();
      const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerAddress);

      await setBalance(administrator.account.address, parseEther('1'));
      await pauseManager.write.pauseContract([Grid.address], {
        account: administrator.account,
      });

      await expect(
        Grid.write.roll([targetCells, zeroAddress, betAmount], {
          account: user.account.address,
          value: betAmount,
        }),
      ).to.be.rejectedWith('paused!');
    });

    it('Should revert when specific contract is paused in PauseManager with ERC20 token', async function () {
      const { Grid, user, administrator, addressBook, mockToken } = await loadFixture(deployGridFixture);
      const betAmount = 1000000000000000n;
      const targetCells = 0b0000000000000000000011111;

      const pauseManagerAddress = await addressBook.read.pauseManager();
      const pauseManager = await hre.viem.getContractAt('PauseManager', pauseManagerAddress);

      await setBalance(administrator.account.address, parseEther('1'));

      await mockToken.write.approve([Grid.address, betAmount], {
        account: user.account.address,
      });

      await pauseManager.write.pauseContract([Grid.address], {
        account: administrator.account,
      });

      await expect(
        Grid.write.roll([targetCells, mockToken.address, betAmount], {
          account: user.account.address,
        }),
      ).to.be.rejectedWith('paused!');
    });
  });

  describe('Configuration Functions', function () {
    it('Should allow owners multisig to update VRF Coordinator', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const newCoordinator = '0x1234567890123456789012345678901234567890';

      await Grid.write.updateVRFSettings([newCoordinator, 0n], {
        account: ownersMultisig.address,
      });

      // We can't directly check the s_vrfCoordinator as it's a private variable
      // But we can verify the transaction succeeded
      // This is similar to how other configuration tests are structured
    });

    it('Should allow owners multisig to update subscription ID', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const newSubscriptionId = 42n;

      await Grid.write.updateVRFSettings([zeroAddress, newSubscriptionId], {
        account: ownersMultisig.address,
      });

      // We can't directly check the subscriptionId as it's a private variable
      // But we can verify the transaction succeeded
      // This is similar to how other configuration tests are structured
    });

    it('Should allow owners multisig to update both VRF Coordinator and subscription ID', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const newCoordinator = '0x1234567890123456789012345678901234567890';
      const newSubscriptionId = 42n;

      await Grid.write.updateVRFSettings([newCoordinator, newSubscriptionId], {
        account: ownersMultisig.address,
      });

      // We can't directly check the private variables
      // But we can verify the transaction succeeded
    });

    it('Should prevent non-owners from updating VRF settings', async function () {
      const { Grid, user } = await loadFixture(deployGridFixture);
      const newCoordinator = '0x1234567890123456789012345678901234567890';
      const newSubscriptionId = 42n;

      await expect(
        Grid.write.updateVRFSettings([newCoordinator, newSubscriptionId], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should allow owners multisig to set minimum bet amount', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const initialMinBetAmount = await Grid.read.minBetAmount();
      const newMinBetAmount = initialMinBetAmount + parseEther('0.001');

      await Grid.write.setMinBetAmount([newMinBetAmount], {
        account: ownersMultisig.address,
      });

      const updatedMinBetAmount = await Grid.read.minBetAmount();
      expect(updatedMinBetAmount).to.equal(newMinBetAmount);
    });

    it('Should prevent setting invalid minimum bet amount', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const maxBetAmount = await Grid.read.maxBetAmount();

      await expect(
        Grid.write.setMinBetAmount([0n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet amount must be greater than 0');

      await expect(
        Grid.write.setMinBetAmount([maxBetAmount], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet amount must be less than max bet');

      await expect(
        Grid.write.setMinBetAmount([maxBetAmount + 1n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Min bet amount must be less than max bet');
    });

    it('Should allow owners multisig to set maximum bet amount', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const initialMaxBetAmount = await Grid.read.maxBetAmount();
      const newMaxBetAmount = initialMaxBetAmount + parseEther('1');

      await Grid.write.setMaxBetAmount([newMaxBetAmount], {
        account: ownersMultisig.address,
      });

      const updatedMaxBetAmount = await Grid.read.maxBetAmount();

      expect(updatedMaxBetAmount).to.equal(newMaxBetAmount);
    });

    it('Should prevent setting invalid maximum bet amount', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const minBetAmount = await Grid.read.minBetAmount();

      await expect(
        Grid.write.setMaxBetAmount([minBetAmount], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Max bet amount must be greater than min bet');

      await expect(
        Grid.write.setMaxBetAmount([minBetAmount - 1n], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Max bet amount must be greater than min bet');
    });

    it('Should allow owners multisig to set house edge', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const initialHouseEdge = await Grid.read.houseEdge();
      const newHouseEdge = initialHouseEdge + 5;

      await Grid.write.setHouseEdge([newHouseEdge], {
        account: ownersMultisig.address,
      });

      const updatedHouseEdge = await Grid.read.houseEdge();

      expect(updatedHouseEdge).to.equal(newHouseEdge);
    });

    it('Should prevent setting invalid house edge', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);

      await expect(
        Grid.write.setHouseEdge([51], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('House edge must be less than or equal to 50');
    });

    it('Should prevent non-owners from changing configuration', async function () {
      const { Grid, user } = await loadFixture(deployGridFixture);

      await expect(
        Grid.write.setMinBetAmount([parseEther('0.002')], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Grid.write.setMaxBetAmount([parseEther('2')], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Grid.write.setHouseEdge([15], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        Grid.write.setCallbackGasLimit([100000], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should allow owners multisig to set callback gas limit', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);
      const newGasLimit = 150000;

      await Grid.write.setCallbackGasLimit([newGasLimit], {
        account: ownersMultisig.address,
      });

      // We can't directly check the callbackGasLimit as it's a private variable
      // But we can verify the transaction succeeded
      // This is similar to how other configuration tests are structured
    });

    it('Should prevent setting invalid callback gas limit', async function () {
      const { Grid, ownersMultisig } = await loadFixture(deployGridFixture);

      await expect(
        Grid.write.setCallbackGasLimit([50000], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Gas limit too low');

      await expect(
        Grid.write.setCallbackGasLimit([0], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Gas limit too low');
    });
  });

  describe('Withdraw to Treasury', function () {
    it('Should allow administrators to withdraw native tokens to treasury', async function () {
      const { Grid, administrator, treasury, publicClient, zeroAddress } = await loadFixture(deployGridFixture);

      const initialDiceBalance = await Grid.read.getContractBalance();
      const initialTreasuryBalance = await publicClient.getBalance({ address: treasury.address });

      const withdrawAmount = parseEther('1');

      await Grid.write.withdrawToTreasury([zeroAddress, withdrawAmount], {
        account: administrator.account.address,
      });

      const finalDiceBalance = await Grid.read.getContractBalance();
      const finalTreasuryBalance = await publicClient.getBalance({ address: treasury.address });

      expect(finalDiceBalance).to.equal(initialDiceBalance - withdrawAmount);
      expect(finalTreasuryBalance).to.equal(initialTreasuryBalance + withdrawAmount);
    });

    it('Should allow administrators to withdraw ERC20 tokens to treasury', async function () {
      const { Grid, administrator, treasury, mockToken } = await loadFixture(deployGridFixture);

      const initialDiceTokenBalance = await mockToken.read.balanceOf([Grid.address]);
      const initialTreasuryTokenBalance = await mockToken.read.balanceOf([treasury.address]);

      const withdrawAmount = parseEther('1');

      await Grid.write.withdrawToTreasury([mockToken.address, withdrawAmount], {
        account: administrator.account.address,
      });

      const finalDiceTokenBalance = await mockToken.read.balanceOf([Grid.address]);
      const finalTreasuryTokenBalance = await mockToken.read.balanceOf([treasury.address]);

      expect(finalDiceTokenBalance).to.equal(initialDiceTokenBalance - withdrawAmount);
      expect(finalTreasuryTokenBalance).to.equal(initialTreasuryTokenBalance + withdrawAmount);
    });

    it('Should revert if non-administrator tries to withdraw native tokens', async function () {
      const { Grid, user, zeroAddress } = await loadFixture(deployGridFixture);

      await expect(
        Grid.write.withdrawToTreasury([zeroAddress, parseEther('1')], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should revert if non-administrator tries to withdraw ERC20 tokens', async function () {
      const { Grid, user, mockToken } = await loadFixture(deployGridFixture);

      await expect(
        Grid.write.withdrawToTreasury([mockToken.address, parseEther('1')], {
          account: user.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should revert if withdrawal amount is zero for native tokens', async function () {
      const { Grid, administrator, zeroAddress } = await loadFixture(deployGridFixture);

      await expect(
        Grid.write.withdrawToTreasury([zeroAddress, 0n], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('_amount is zero!');
    });

    it('Should revert if withdrawal amount is zero for ERC20 tokens', async function () {
      const { Grid, administrator, mockToken } = await loadFixture(deployGridFixture);

      await expect(
        Grid.write.withdrawToTreasury([mockToken.address, 0n], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('_amount is zero!');
    });

    it('Should revert if withdrawal amount exceeds contract balance for native tokens', async function () {
      const { Grid, administrator, zeroAddress } = await loadFixture(deployGridFixture);

      const contractBalance = await Grid.read.getContractBalance();
      const excessiveAmount = contractBalance + 1n;

      await expect(
        Grid.write.withdrawToTreasury([zeroAddress, excessiveAmount], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('Insufficient contract balance');
    });

    it('Should revert if withdrawal amount exceeds contract balance for ERC20 tokens', async function () {
      const { Grid, administrator, mockToken } = await loadFixture(deployGridFixture);

      const tokenBalance = await mockToken.read.balanceOf([Grid.address]);
      const excessiveAmount = tokenBalance + 1n;

      await expect(
        Grid.write.withdrawToTreasury([mockToken.address, excessiveAmount], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('Insufficient token balance');
    });
  });
});
