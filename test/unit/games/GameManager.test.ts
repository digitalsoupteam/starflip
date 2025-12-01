import { expect } from 'chai';
import hre from 'hardhat';
import { Address, encodeFunctionData, getAddress, parseEther } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { getImplementationAddress } from '../../../scripts/utils/getImplementationAddress';

describe('GameManager Contract', function () {
  async function deployGameManagerFixture() {
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

    const mockGameImpl = await hre.viem.deployContract('Dice', [deployer.account.address]);
    const mockGameInitData = encodeFunctionData({
      abi: mockGameImpl.abi,
      functionName: 'initialize',
      args: [
        deployer.account.address,
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
    const mockGameProxy = await hre.viem.deployContract('ERC1967Proxy', [
      mockGameImpl.address,
      mockGameInitData,
    ]);
    const mockGame = await hre.viem.getContractAt('Dice', mockGameProxy.address);

    const invalidGame = await hre.viem.deployContract('ERC1967Proxy', [addressBook.address, '0x']);

    for (const owner of [owner1, owner2]) {
      await setBalance(owner.account.address, parseEther('100'));
    }
    await setBalance(administrator.account.address, parseEther('100'));
    await setBalance(user.account.address, parseEther('100'));

    return {
      publicClient,
      gameManager,
      addressBook,
      accessRoles,
      ownersMultisig,
      mockGame,
      invalidGame,
      administrator,
      user,
      owner1,
      owner2,
      deployer,
    };
  }

  describe('Deployment', function () {
    it('Should deploy successfully', async function () {
      const { gameManager } = await loadFixture(deployGameManagerFixture);
      expect(gameManager.address).to.not.equal(0);
    });
  });

  describe('Initialization', function () {
    it('Should initialize with the correct address book', async function () {
      const { gameManager, addressBook } = await loadFixture(deployGameManagerFixture);

      const gameAddresses = await gameManager.read.getAllGames();
      expect(gameAddresses.length).to.equal(0);
    });

    it('Should revert if initialized with zero address', async function () {
      const [deployer] = await hre.viem.getWalletClients();

      const gameManagerImpl = await hre.viem.deployContract('GameManager');

      const gameManagerProxy = await hre.viem.deployContract('ERC1967Proxy', [
        gameManagerImpl.address,
        '0x',
      ]);

      const gameManager = await hre.viem.getContractAt('GameManager', gameManagerProxy.address);

      await expect(
        gameManager.write.initialize(['0x0000000000000000000000000000000000000000'], {
          account: deployer.account.address,
        }),
      ).to.be.rejectedWith('Zero address');
    });

    it('Should not allow re-initialization', async function () {
      const { gameManager, addressBook, deployer } = await loadFixture(deployGameManagerFixture);

      await expect(
        gameManager.write.initialize([addressBook.address], {
          account: deployer.account.address,
        }),
      ).to.be.rejected;
    });
  });

  describe('Adding Games', function () {
    it('Should allow owners multisig to add a game', async function () {
      const { gameManager, mockGame, ownersMultisig } = await loadFixture(deployGameManagerFixture);

      const txHash = await gameManager.write.addGame([mockGame.address], {
        account: ownersMultisig.address,
      });

      const publicClient = await hre.viem.getPublicClient();
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      const events = await gameManager.getEvents.GameAdded({
        blockHash: receipt.blockHash,
      });

      expect(events.length).to.equal(1);
      expect(getAddress(events[0].args.gameAddress as Address)).to.equal(
        getAddress(mockGame.address),
      );

      const exists = await gameManager.read.isGameExist([mockGame.address]);
      expect(exists).to.be.true;

      const gameAddresses = await gameManager.read.getAllGames();
      expect(gameAddresses.length).to.equal(1);
      expect(getAddress(gameAddresses[0])).to.equal(getAddress(mockGame.address));
    });

    it('Should prevent non-owners from adding a game', async function () {
      const { gameManager, mockGame, user, administrator } =
        await loadFixture(deployGameManagerFixture);

      await expect(
        gameManager.write.addGame([mockGame.address], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        gameManager.write.addGame([mockGame.address], {
          account: administrator.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should reject adding a game with zero address', async function () {
      const { gameManager, ownersMultisig } = await loadFixture(deployGameManagerFixture);

      await expect(
        gameManager.write.addGame(['0x0000000000000000000000000000000000000000'], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Zero address');
    });

    it('Should reject adding a game that already exists', async function () {
      const { gameManager, mockGame, ownersMultisig } = await loadFixture(deployGameManagerFixture);

      await gameManager.write.addGame([mockGame.address], {
        account: ownersMultisig.address,
      });

      await expect(
        gameManager.write.addGame([mockGame.address], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Game already exists');
    });

    it('Should reject adding an invalid game contract', async function () {
      const { gameManager, invalidGame, ownersMultisig } =
        await loadFixture(deployGameManagerFixture);

      await expect(
        gameManager.write.addGame([invalidGame.address], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Invalid game contract');
    });
  });

  describe('Getting Game Information', function () {
    it('Should correctly identify if a game exists', async function () {
      const { gameManager, mockGame, ownersMultisig } = await loadFixture(deployGameManagerFixture);

      let exists = await gameManager.read.isGameExist([mockGame.address]);
      expect(exists).to.be.false;

      await gameManager.write.addGame([mockGame.address], {
        account: ownersMultisig.address,
      });

      exists = await gameManager.read.isGameExist([mockGame.address]);
      expect(exists).to.be.true;
    });

    it('Should return false for non-existent game', async function () {
      const { gameManager } = await loadFixture(deployGameManagerFixture);

      const exists = await gameManager.read.isGameExist([
        '0x1234567890123456789012345678901234567890',
      ]);
      expect(exists).to.be.false;
    });

    it('Should return all game addresses', async function () {
      const { gameManager, mockGame, ownersMultisig } = await loadFixture(deployGameManagerFixture);

      let gameAddresses = await gameManager.read.getAllGames();
      expect(gameAddresses.length).to.equal(0);

      await gameManager.write.addGame([mockGame.address], {
        account: ownersMultisig.address,
      });

      const mockGameImpl2 = await hre.viem.deployContract('Dice', [ownersMultisig.address]);

      await gameManager.write.addGame([mockGameImpl2.address], {
        account: ownersMultisig.address,
      });

      gameAddresses = await gameManager.read.getAllGames();
      expect(gameAddresses.length).to.equal(2);
      expect(getAddress(gameAddresses[0])).to.equal(getAddress(mockGame.address));
      expect(getAddress(gameAddresses[1])).to.equal(getAddress(mockGameImpl2.address));
    });
  });

  describe('Removing Games', function () {
    it('Should allow owners multisig to remove a game', async function () {
      const { gameManager, mockGame, ownersMultisig, publicClient } = await loadFixture(deployGameManagerFixture);

      await gameManager.write.addGame([mockGame.address], {
        account: ownersMultisig.address,
      });

      let exists = await gameManager.read.isGameExist([mockGame.address]);
      expect(exists).to.be.true;

      const txHash = await gameManager.write.removeGame([mockGame.address], {
        account: ownersMultisig.address,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      const events = await gameManager.getEvents.GameRemoved({
        blockHash: receipt.blockHash,
      });

      expect(events.length).to.equal(1);
      expect(getAddress(events[0].args.gameAddress as Address)).to.equal(
        getAddress(mockGame.address),
      );

      exists = await gameManager.read.isGameExist([mockGame.address]);
      expect(exists).to.be.false;

      const gameAddresses = await gameManager.read.getAllGames();
      expect(gameAddresses.length).to.equal(0);
    });

    it('Should prevent non-owners from removing a game', async function () {
      const { gameManager, mockGame, ownersMultisig, user, administrator } =
        await loadFixture(deployGameManagerFixture);

      await gameManager.write.addGame([mockGame.address], {
        account: ownersMultisig.address,
      });

      await expect(
        gameManager.write.removeGame([mockGame.address], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        gameManager.write.removeGame([mockGame.address], {
          account: administrator.account.address,
        }),
      ).to.be.rejected;

      const exists = await gameManager.read.isGameExist([mockGame.address]);
      expect(exists).to.be.true;
    });

    it('Should reject removing a game with zero address', async function () {
      const { gameManager, ownersMultisig } = await loadFixture(deployGameManagerFixture);

      await expect(
        gameManager.write.removeGame(['0x0000000000000000000000000000000000000000'], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Zero address');
    });

    it('Should reject removing a non-existent game', async function () {
      const { gameManager, mockGame, ownersMultisig } = await loadFixture(deployGameManagerFixture);

      await expect(
        gameManager.write.removeGame([mockGame.address], {
          account: ownersMultisig.address,
        }),
      ).to.be.rejectedWith('Game does not exist');
    });

    it('Should correctly handle removing games from the middle of the array', async function () {
      const { gameManager, mockGame, ownersMultisig } = await loadFixture(deployGameManagerFixture);

      await gameManager.write.addGame([mockGame.address], {
        account: ownersMultisig.address,
      });

      const mockGameImpl2 = await hre.viem.deployContract('Dice', [ownersMultisig.address]);
      await gameManager.write.addGame([mockGameImpl2.address], {
        account: ownersMultisig.address,
      });

      const mockGameImpl3 = await hre.viem.deployContract('Dice', [ownersMultisig.address]);
      await gameManager.write.addGame([mockGameImpl3.address], {
        account: ownersMultisig.address,
      });

      let gameAddresses = await gameManager.read.getAllGames();
      expect(gameAddresses.length).to.equal(3);

      await gameManager.write.removeGame([mockGameImpl2.address], {
        account: ownersMultisig.address,
      });

      const exists = await gameManager.read.isGameExist([mockGameImpl2.address]);
      expect(exists).to.be.false;

      gameAddresses = await gameManager.read.getAllGames();
      expect(gameAddresses.length).to.equal(2);
      expect(getAddress(gameAddresses[0])).to.equal(getAddress(mockGame.address));
      expect(getAddress(gameAddresses[1])).to.equal(getAddress(mockGameImpl3.address));
    });
  });

  describe('UUPS Upgradeability', function () {
    it('Should allow owners multisig to upgrade the implementation', async function () {
      const { publicClient, gameManager, ownersMultisig } =
        await loadFixture(deployGameManagerFixture);

      const newImplementation = await hre.viem.deployContract('GameManager');

      await impersonateAccount(ownersMultisig.address);
      await gameManager.write.upgradeToAndCall([newImplementation.address, '0x'], {
        account: ownersMultisig.address,
      });

      const implementationAddress = await getImplementationAddress(
        publicClient,
        gameManager.address,
      );

      expect(getAddress(implementationAddress)).to.equal(getAddress(newImplementation.address));
    });

    it('Should prevent non-owners from upgrading the implementation', async function () {
      const { gameManager, user, administrator, deployer } =
        await loadFixture(deployGameManagerFixture);

      const newImplementation = await hre.viem.deployContract('GameManager');

      await expect(
        gameManager.write.upgradeToAndCall([newImplementation.address, '0x'], {
          account: user.account.address,
        }),
      ).to.be.rejected;

      await expect(
        gameManager.write.upgradeToAndCall([newImplementation.address, '0x'], {
          account: administrator.account.address,
        }),
      ).to.be.rejected;
    });
  });
});
