import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther, zeroAddress } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';

/**
 * PauseManager Integration Test
 *
 * This file tests the integration between PauseManager and multiple game contracts.
 * It verifies that:
 * 1. Global pause affects all game contracts
 * 2. Contract-specific pause only affects the targeted contract
 * 3. Proper interaction between AddressBook, PauseManager, and game contracts
 */
describe('PauseManager Integration Test', function () {
  async function deployMultipleGamesFixture() {
    const [deployer, user, , , , , , administrator, owner1, owner2] =
      await hre.viem.getWalletClients();
    const publicClient = await hre.viem.getPublicClient();
    const owners = [owner1, owner2];

    // Deploy owners multisig
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

    // Deploy AccessRoles
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

    // Deploy AddressBook
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

    // Deploy GameManager
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

    // Set GameManager in AddressBook
    await addressBook.write.initialSetGameManager([gameManager.address], {
      account: deployer.account.address,
    });

    // Deploy PauseManager
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

    // Set PauseManager in AddressBook
    await addressBook.write.initialSetPauseManager([pauseManager.address], {
      account: deployer.account.address,
    });

    // Deploy Pricers for native token
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

    // Deploy TokensManager
    const tokensManagerImpl = await hre.viem.deployContract('TokensManager');
    const tokensManagerInitData = encodeFunctionData({
      abi: tokensManagerImpl.abi,
      functionName: 'initialize',
      args: [
        addressBook.address,
        [zeroAddress],
        [nativePricer.address],
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

    // Deploy MockVRFCoordinator for Dice games
    const MockVRFCoordinator = await hre.viem.deployContract('MockVRFCoordinator', []);

    // Deploy first Dice game
    const Dice1Impl = await hre.viem.deployContract('Dice', [MockVRFCoordinator.address]);
    const dice1InitData = encodeFunctionData({
      abi: Dice1Impl.abi,
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
    const Dice1Proxy = await hre.viem.deployContract('ERC1967Proxy', [
      Dice1Impl.address,
      dice1InitData,
    ]);
    const Dice1 = await hre.viem.getContractAt('Dice', Dice1Proxy.address);
    await setBalance(Dice1.address, parseEther('100'));

    // Deploy second Dice game
    const Dice2Impl = await hre.viem.deployContract('Dice', [MockVRFCoordinator.address]);
    const dice2InitData = encodeFunctionData({
      abi: Dice2Impl.abi,
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
    const Dice2Proxy = await hre.viem.deployContract('ERC1967Proxy', [
      Dice2Impl.address,
      dice2InitData,
    ]);
    const Dice2 = await hre.viem.getContractAt('Dice', Dice2Proxy.address);
    await setBalance(Dice2.address, parseEther('100'));

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

    // Register both Dice games in GameManager
    await gameManager.write.addGame([Dice1.address], {
      account: ownersMultisig.address,
    });
    await gameManager.write.addGame([Dice2.address], {
      account: ownersMultisig.address,
    });
    await addressBook.write.initialSetReferralProgram([referralProgram.address], {
      account: deployer.account.address,
    });

    return {
      publicClient,
      pauseManager,
      accessRoles,
      addressBook,
      gameManager,
      ownersMultisig,
      administrator,
      user,
      Dice1,
      Dice2,
      MockVRFCoordinator,
      deployer,
    };
  }

  describe('Global Pause Integration', function () {
    it('Should prevent all games from operating when globally paused', async function () {
      const { pauseManager, administrator, user, Dice1, Dice2 } = await loadFixture(
        deployMultipleGamesFixture
      );

      // Verify both games are operational before pause
      await Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });

      await Dice2.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });

      // Pause globally
      await pauseManager.write.pause({
        account: administrator.account.address,
      });

      // Verify both games are now paused
      await expect(
        Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');

      await expect(
        Dice2.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');
    });

    it('Should allow all games to operate again after global unpause', async function () {
      const { pauseManager, administrator, ownersMultisig, user, Dice1, Dice2, MockVRFCoordinator } = 
        await loadFixture(deployMultipleGamesFixture);

      // Pause globally
      await pauseManager.write.pause({
        account: administrator.account.address,
      });

      // Verify both games are paused
      await expect(
        Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');

      // Unpause globally
      await pauseManager.write.unpause({
        account: ownersMultisig.address,
      });

      // Verify both games are operational again
      await Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });

      // Fulfill the random words to clear the pending roll
      await MockVRFCoordinator.write.fulfillRandomWords([Dice1.address, [123n]], {
        account: user.account.address,
      });

      await Dice2.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });
    });
  });

  describe('Contract-specific Pause Integration', function () {
    it('Should only pause the specified contract', async function () {
      const { pauseManager, administrator, user, Dice1, Dice2 } = await loadFixture(
        deployMultipleGamesFixture
      );

      // Pause only Dice1
      await pauseManager.write.pauseContract([Dice1.address], {
        account: administrator.account.address,
      });

      // Verify Dice1 is paused
      await expect(
        Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');

      // Verify Dice2 is still operational
      await Dice2.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });
    });

    it('Should allow the contract to operate again after specific unpause', async function () {
      const { pauseManager, administrator, ownersMultisig, user, Dice1, MockVRFCoordinator } = 
        await loadFixture(deployMultipleGamesFixture);

      // Pause Dice1
      await pauseManager.write.pauseContract([Dice1.address], {
        account: administrator.account.address,
      });

      // Verify Dice1 is paused
      await expect(
        Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');

      // Unpause Dice1
      await pauseManager.write.unpauseContract([Dice1.address], {
        account: ownersMultisig.address,
      });

      // Verify Dice1 is operational again
      await Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });
    });
  });

  describe('Complex Pause Scenarios', function () {
    it('Should handle global pause and contract-specific pause together', async function () {
      const { pauseManager, administrator, ownersMultisig, user, Dice1, Dice2, MockVRFCoordinator } = 
        await loadFixture(deployMultipleGamesFixture);

      // Pause Dice1 specifically
      await pauseManager.write.pauseContract([Dice1.address], {
        account: administrator.account.address,
      });

      // Verify Dice1 is paused and Dice2 is operational
      await expect(
        Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');

      await Dice2.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });

      // Now pause globally
      await pauseManager.write.pause({
        account: administrator.account.address,
      });

      // Verify both games are now paused
      await expect(
        Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');

      await expect(
        Dice2.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');

      // Unpause globally
      await pauseManager.write.unpause({
        account: ownersMultisig.address,
      });

      // Verify Dice1 is still paused (due to contract-specific pause) but Dice2 is operational
      await expect(
        Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
          account: user.account.address,
          value: parseEther('0.01'),
        })
      ).to.be.rejectedWith('paused!');

      // Fulfill the random words to clear the pending roll for Dice2
      await MockVRFCoordinator.write.fulfillRandomWords([Dice2.address, [123n]], {
        account: user.account.address,
      });

      await Dice2.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });

      // Finally unpause Dice1 specifically
      await pauseManager.write.unpauseContract([Dice1.address], {
        account: ownersMultisig.address,
      });

      // Verify both games are now operational
      await Dice1.write.roll([50n, 0, zeroAddress, 0n, zeroAddress], {
        account: user.account.address,
        value: parseEther('0.01'),
      });
    });
  });
});
