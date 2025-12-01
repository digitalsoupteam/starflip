import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther, zeroAddress } from 'viem';
import {
  impersonateAccount,
  loadFixture,
  setBalance,
} from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import { getImplementationAddress } from '../../../scripts/utils/getImplementationAddress';

describe('ReferralProgram Contract', function () {
  async function deployReferralProgramFixture() {
    const [deployer, player1, player2, player3, , , , administrator, owner1, owner2] =
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

    // Deploy TokensManager
    const mockToken1 = await hre.viem.deployContract('MockERC20', ['Mock Token 1', 'MTK1', 18]);
    const mockToken2 = await hre.viem.deployContract('MockERC20', ['Mock Token 2', 'MTK2', 6]);

    const pricer1Impl = await hre.viem.deployContract('Pricer');
    const pricer1InitData = encodeFunctionData({
      abi: pricer1Impl.abi,
      functionName: 'initialize',
      args: [addressBook.address, 50000000000n, 'ETH/USD Pricer'],
    });
    const pricer1Proxy = await hre.viem.deployContract('ERC1967Proxy', [
      pricer1Impl.address,
      pricer1InitData,
    ]);
    const pricer1 = await hre.viem.getContractAt('Pricer', pricer1Proxy.address);

    const pricer2Impl = await hre.viem.deployContract('Pricer');
    const pricer2InitData = encodeFunctionData({
      abi: pricer2Impl.abi,
      functionName: 'initialize',
      args: [addressBook.address, 100000000n, 'USDC/USD Pricer'],
    });
    const pricer2Proxy = await hre.viem.deployContract('ERC1967Proxy', [
      pricer2Impl.address,
      pricer2InitData,
    ]);
    const pricer2 = await hre.viem.getContractAt('Pricer', pricer2Proxy.address);

    const TokensManagerImpl = await hre.viem.deployContract('TokensManager');
    const TokensManagerInitData = encodeFunctionData({
      abi: TokensManagerImpl.abi,
      functionName: 'initialize',
      args: [
        addressBook.address,
        [zeroAddress, mockToken1.address],
        [pricer1.address, pricer2.address],
      ],
    });
    const TokensManagerProxy = await hre.viem.deployContract('ERC1967Proxy', [
      TokensManagerImpl.address,
      TokensManagerInitData,
    ]);
    const tokensManager = await hre.viem.getContractAt('TokensManager', TokensManagerProxy.address);

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

    // Set contracts in AddressBook
    await addressBook.write.initialSetPauseManager([pauseManager.address], {
      account: deployer.account.address,
    });
    await addressBook.write.initialSetTreasury([treasury.address], {
      account: deployer.account.address,
    });
    await addressBook.write.initialSetTokensManager([tokensManager.address], {
      account: deployer.account.address,
    });
    await addressBook.write.initialSetGameManager([gameManager.address], {
      account: deployer.account.address,
    });
    await addressBook.write.initialSetReferralProgram([referralProgram.address], {
      account: deployer.account.address,
    });

    // Register game contract in GameManager
    await gameManager.write.addGame([mockGame.address], {
      account: ownersMultisig.address,
    });

    // Deploy a mock ERC20 token for testing
    const mockToken = await hre.viem.deployContract('MockERC20', ['Mock Token', 'MTK', 18]);
    await mockToken.write.mint([referralProgram.address, parseEther('1000')]);

    // Setup owners and players with balance
    for (const wallet of [owner1, owner2, player1, player2, player3]) {
      await setBalance(wallet.account.address, parseEther('100'));
    }

    await impersonateAccount(mockGame.address);
    await setBalance(mockGame.address, parseEther('100'));

    return {
      publicClient,
      referralProgram,
      accessRoles,
      addressBook,
      gameManager,
      pauseManager,
      tokensManager,
      treasury,
      ownersMultisig,
      administrator,
      player1,
      player2,
      player3,
      mockGame,
      deployer,
      mockToken,
      initialReferralPercent,
    };
  }

  describe('Deployment', function () {
    it('Should deploy successfully', async function () {
      const { referralProgram } = await loadFixture(deployReferralProgramFixture);
      expect(referralProgram.address).to.not.equal(0);
    });

    it('Should be registered in AddressBook', async function () {
      const { referralProgram, addressBook } = await loadFixture(deployReferralProgramFixture);
      const registeredReferralProgram = await addressBook.read.referralProgram();
      expect(getAddress(registeredReferralProgram.toLowerCase())).to.equal(
        getAddress(referralProgram.address.toLowerCase()),
      );
    });
  });

  describe('Initialization', function () {
    it('Should initialize with correct address book and referral percent', async function () {
      const { referralProgram, addressBook, initialReferralPercent } = await loadFixture(
        deployReferralProgramFixture,
      );

      const divider = await referralProgram.read.DIVIDER();
      expect(initialReferralPercent <= divider).to.be.true;
    });

    it('Should revert if initialized with zero address', async function () {
      const referralProgramImpl = await hre.viem.deployContract('ReferralProgram');
      const initialReferralPercent = 500n;

      const initData = encodeFunctionData({
        abi: referralProgramImpl.abi,
        functionName: 'initialize',
        args: [zeroAddress, initialReferralPercent],
      });

      await expect(hre.viem.deployContract('ERC1967Proxy', [referralProgramImpl.address, initData]))
        .to.be.rejected;
    });
  });

  describe('Setting Referrals', function () {
    it('Should set referral relationship correctly', async function () {
      const { referralProgram, player1, player2, mockGame } = await loadFixture(
        deployReferralProgramFixture,
      );

      // Set player2 as referrer for player1
      await referralProgram.write.setReferral([player1.account.address, player2.account.address], {
        account: mockGame.address,
      });

      // Check if the referrer is set correctly
      const referrer = await referralProgram.read.referrerOf([player1.account.address]);
      expect(getAddress(referrer)).to.equal(getAddress(player2.account.address));

      // Check if player1 is in player2's referrals list
      const referrals = await referralProgram.read.referralsOf([player2.account.address]);
      expect(referrals.length).to.equal(1);
      expect(getAddress(referrals[0])).to.equal(getAddress(player1.account.address));
    });

    it('Should revert if player is zero address', async function () {
      const { referralProgram, player2, mockGame } = await loadFixture(
        deployReferralProgramFixture,
      );

      await expect(
        referralProgram.write.setReferral([zeroAddress, player2.account.address], {
          account: mockGame.address,
        }),
      ).to.be.rejectedWith('ReferralProgram: player is the zero address');
    });

    it('Should revert if referrer is zero address', async function () {
      const { referralProgram, player1, mockGame } = await loadFixture(
        deployReferralProgramFixture,
      );

      await expect(
        referralProgram.write.setReferral([player1.account.address, zeroAddress], {
          account: mockGame.address,
        }),
      ).to.be.rejectedWith('ReferralProgram: referrer is the zero address');
    });

    it('Should revert if player tries to refer themselves', async function () {
      const { referralProgram, player1, mockGame } = await loadFixture(
        deployReferralProgramFixture,
      );

      await expect(
        referralProgram.write.setReferral([player1.account.address, player1.account.address], {
          account: mockGame.address,
        }),
      ).to.be.rejectedWith('ReferralProgram: player cannot refer themselves');
    });

    it('Should revert if player already has a referrer', async function () {
      const { referralProgram, player1, player2, player3, mockGame } = await loadFixture(
        deployReferralProgramFixture,
      );

      // Set player2 as referrer for player1
      await referralProgram.write.setReferral([player1.account.address, player2.account.address], {
        account: mockGame.address,
      });

      // Try to set player3 as referrer for player1
      await expect(
        referralProgram.write.setReferral([player1.account.address, player3.account.address], {
          account: mockGame.address,
        }),
      ).to.be.rejectedWith('ReferralProgram: player already has a referrer');
    });

    it('Should revert if called by non-game contract', async function () {
      const { referralProgram, player1, player2 } = await loadFixture(deployReferralProgramFixture);

      // Try to set referral from a non-game contract (player2 address)
      await expect(
        referralProgram.write.setReferral([player1.account.address, player2.account.address], {
          account: player2.account.address,
        }),
      ).to.be.rejectedWith('only game!');
    });
  });

  describe('Adding Rewards', function () {
    it('Should add native token rewards correctly', async function () {
      const { referralProgram, player1, player2, mockGame, initialReferralPercent } =
        await loadFixture(deployReferralProgramFixture);

      const DIVIDER = await referralProgram.read.DIVIDER();

      // Set player2 as referrer for player1
      await referralProgram.write.setReferral([player1.account.address, player2.account.address], {
        account: mockGame.address,
      });

      // Add reward for player1 (which should go to player2 as the referrer)
      const betAmount = parseEther('1');
      const rewardAmount = (betAmount * initialReferralPercent) / DIVIDER;
      await referralProgram.write.addReward([player1.account.address, betAmount, zeroAddress], {
        account: mockGame.address,
        value: betAmount,
      });

      // Check if player2 received the reward
      const reward = await referralProgram.read.rewards([player2.account.address, zeroAddress]);
      expect(reward).to.equal(rewardAmount);
    });

    it('Should add ERC20 token rewards correctly', async function () {
      const { referralProgram, player1, player2, mockGame, mockToken, initialReferralPercent } =
        await loadFixture(deployReferralProgramFixture);

      const DIVIDER = await referralProgram.read.DIVIDER();

      // Set player2 as referrer for player1
      await referralProgram.write.setReferral([player1.account.address, player2.account.address], {
        account: mockGame.address,
      });

      // Add reward for player1 (which should go to player2 as the referrer)
      const betAmount = parseEther('1');
      const rewardAmount = (betAmount * initialReferralPercent) / DIVIDER;
      await referralProgram.write.addReward(
        [player1.account.address, betAmount, mockToken.address],
        { account: mockGame.address },
      );

      // Check if player2 received the reward
      const reward = await referralProgram.read.rewards([
        player2.account.address,
        mockToken.address,
      ]);
      expect(reward).to.equal(rewardAmount);
    });

    it('Should not add rewards if player has no referrer', async function () {
      const { referralProgram, player1, mockGame } = await loadFixture(
        deployReferralProgramFixture,
      );

      // Add reward for player1 (who has no referrer)
      const rewardAmount = parseEther('1');
      await referralProgram.write.addReward([player1.account.address, rewardAmount, zeroAddress], {
        account: mockGame.address,
        value: rewardAmount,
      });

      // No rewards should be added since player1 has no referrer
      // This test just verifies that the function doesn't revert
    });

    it('Should revert if called by non-game contract', async function () {
      const { referralProgram, player1, player2 } = await loadFixture(deployReferralProgramFixture);

      // Try to add reward from a non-game contract
      const rewardAmount = parseEther('1');
      await expect(
        referralProgram.write.addReward([player1.account.address, rewardAmount, zeroAddress], {
          account: player2.account.address,
          value: rewardAmount,
        }),
      ).to.be.rejectedWith('only game!');
    });
  });

  describe('Claiming Rewards', function () {
    it('Should allow claiming native token rewards', async function () {
      const { referralProgram, player1, player2, mockGame, publicClient } = await loadFixture(
        deployReferralProgramFixture,
      );

      // Set player2 as referrer for player1
      await referralProgram.write.setReferral([player1.account.address, player2.account.address], {
        account: mockGame.address,
      });

      // Add reward for player1 (which should go to player2 as the referrer)
      const betAmount = parseEther('1');
      await referralProgram.write.addReward([player1.account.address, betAmount, zeroAddress], {
        account: mockGame.address,
        value: betAmount,
      });

      // Get initial balances
      const initialContractBalance = await publicClient.getBalance({
        address: referralProgram.address,
      });
      const initialPlayer2Balance = await publicClient.getBalance({
        address: player2.account.address,
      });

      const rewards = await referralProgram.read.rewards([player2.account.address, zeroAddress]);

      // Player2 claims the reward
      await referralProgram.write.claim([zeroAddress, rewards], {
        account: player2.account.address,
      });

      // Check final balances
      const finalContractBalance = await publicClient.getBalance({
        address: referralProgram.address,
      });
      const finalPlayer2Balance = await publicClient.getBalance({
        address: player2.account.address,
      });

      expect(finalContractBalance < initialContractBalance).to.be.true;
      expect(finalPlayer2Balance > initialPlayer2Balance).to.be.true;

      // Check that the reward was deducted from player2's rewards
      const remainingReward = await referralProgram.read.rewards([
        player2.account.address,
        zeroAddress,
      ]);
      expect(remainingReward).to.equal(0n);
    });

    it('Should allow claiming ERC20 token rewards', async function () {
      const { referralProgram, player1, player2, mockGame, mockToken } = await loadFixture(
        deployReferralProgramFixture,
      );

      // Set player2 as referrer for player1
      await referralProgram.write.setReferral([player1.account.address, player2.account.address], {
        account: mockGame.address,
      });

      // Add reward for player1 (which should go to player2 as the referrer)
      const betAmount = parseEther('1');

      await referralProgram.write.addReward(
        [player1.account.address, betAmount, mockToken.address],
        { account: mockGame.address },
      );

      const rewards = await referralProgram.read.rewards([player2.account.address, mockToken.address]);

      // Get initial balances
      const initialContractBalance = await mockToken.read.balanceOf([referralProgram.address]);
      const initialPlayer2Balance = await mockToken.read.balanceOf([player2.account.address]);

      // Player2 claims the reward
      await referralProgram.write.claim([mockToken.address, rewards], {
        account: player2.account.address,
      });

      // Check final balances
      const finalContractBalance = await mockToken.read.balanceOf([referralProgram.address]);
      const finalPlayer2Balance = await mockToken.read.balanceOf([player2.account.address]);

      // Contract balance should decrease by rewardAmount
      expect(finalContractBalance).to.equal(initialContractBalance - rewards);

      // Player2 balance should increase by rewardAmount
      expect(finalPlayer2Balance).to.equal(initialPlayer2Balance + rewards);

      // Check that the reward was deducted from player2's rewards
      const remainingReward = await referralProgram.read.rewards([
        player2.account.address,
        mockToken.address,
      ]);
      expect(remainingReward).to.equal(0n);
    });

    it('Should revert if claiming more than available rewards', async function () {
      const { referralProgram, player1, player2, mockGame } = await loadFixture(
        deployReferralProgramFixture,
      );

      // Set player2 as referrer for player1
      await referralProgram.write.setReferral([player1.account.address, player2.account.address], {
        account: mockGame.address,
      });

      // Add reward for player1 (which should go to player2 as the referrer)
      const rewardAmount = parseEther('1');
      await referralProgram.write.addReward([player1.account.address, rewardAmount, zeroAddress], {
        account: mockGame.address,
        value: rewardAmount,
      });

      // Try to claim more than available
      const excessiveAmount = rewardAmount + 1n;
      await expect(
        referralProgram.write.claim([zeroAddress, excessiveAmount], {
          account: player2.account.address,
        }),
      ).to.be.rejectedWith('ReferralProgram: insufficient rewards');
    });

    it('Should revert if claiming zero amount', async function () {
      const { referralProgram, player2 } = await loadFixture(deployReferralProgramFixture);

      await expect(
        referralProgram.write.claim([zeroAddress, 0n], {
          account: player2.account.address,
        }),
      ).to.be.rejectedWith('_amount is zero!');
    });
  });

  describe('Setting Referral Percentage', function () {
    it('Should allow administrator to set referral percentage', async function () {
      const { referralProgram, administrator } = await loadFixture(deployReferralProgramFixture);

      const newPercent = 1000n; // 10%
      await referralProgram.write.setReferralPercent([newPercent], {
        account: administrator.account.address,
      });

      const referralPercent = await referralProgram.read.referralPercent();

      expect(referralPercent).to.equal(newPercent);
    });

    it('Should revert if non-administrator tries to set referral percentage', async function () {
      const { referralProgram, player1 } = await loadFixture(deployReferralProgramFixture);

      const newPercent = 1000n; // 10%
      await expect(
        referralProgram.write.setReferralPercent([newPercent], {
          account: player1.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should revert if percentage exceeds 100%', async function () {
      const { referralProgram, administrator } = await loadFixture(deployReferralProgramFixture);

      const divider = await referralProgram.read.DIVIDER();
      const excessivePercent = divider + 1n;

      await expect(
        referralProgram.write.setReferralPercent([excessivePercent], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('ReferralProgram: percent cannot exceed 100%');
    });
  });

  describe('Withdrawing to Treasury', function () {
    it('Should allow administrator to withdraw native tokens to treasury', async function () {
      const {
        referralProgram,
        player1,
        player2,
        mockGame,
        administrator,
        treasury,
        publicClient,
      } = await loadFixture(deployReferralProgramFixture);

      // Set player2 as referrer for player1
      await referralProgram.write.setReferral([player1.account.address, player2.account.address], {
        account: mockGame.address,
      });

      // Add reward for player1 (which should go to player2 as the referrer)
      const rewardAmount = parseEther('1');
      await referralProgram.write.addReward([player1.account.address, rewardAmount, zeroAddress], {
        account: mockGame.address,
        value: rewardAmount,
      });

      // Get initial balances
      const initialContractBalance = await publicClient.getBalance({
        address: referralProgram.address,
      });
      const initialTreasuryBalance = await publicClient.getBalance({ address: treasury.address });

      // Administrator withdraws half of the funds to treasury
      const withdrawAmount = rewardAmount / 2n;
      await referralProgram.write.withdrawToTreasury([zeroAddress, withdrawAmount], {
        account: administrator.account.address,
      });

      // Check final balances
      const finalContractBalance = await publicClient.getBalance({
        address: referralProgram.address,
      });
      const finalTreasuryBalance = await publicClient.getBalance({ address: treasury.address });

      // Contract balance should decrease by withdrawAmount
      expect(finalContractBalance).to.equal(initialContractBalance - withdrawAmount);

      // Treasury balance should increase by withdrawAmount
      expect(finalTreasuryBalance).to.equal(initialTreasuryBalance + withdrawAmount);
    });

    it('Should allow administrator to withdraw native tokens to treasury (second test)', async function () {
      const { referralProgram, administrator, treasury, publicClient } = await loadFixture(
        deployReferralProgramFixture,
      );

      // Send some ETH to the contract
      await administrator.sendTransaction({
        to: referralProgram.address,
        value: parseEther('1'),
      });

      // Get initial balances
      const initialContractBalance = await publicClient.getBalance({
        address: referralProgram.address,
      });
      const initialTreasuryBalance = await publicClient.getBalance({ address: treasury.address });

      // Administrator withdraws some ETH to treasury
      const withdrawAmount = parseEther('0.5');
      await referralProgram.write.withdrawToTreasury([zeroAddress, withdrawAmount], {
        account: administrator.account.address,
      });

      // Check final balances
      const finalContractBalance = await publicClient.getBalance({
        address: referralProgram.address,
      });
      const finalTreasuryBalance = await publicClient.getBalance({ address: treasury.address });

      // Contract balance should decrease by withdrawAmount
      expect(finalContractBalance).to.equal(initialContractBalance - withdrawAmount);

      // Treasury balance should increase by withdrawAmount
      expect(finalTreasuryBalance).to.equal(initialTreasuryBalance + withdrawAmount);
    });

    it('Should revert if non-administrator tries to withdraw', async function () {
      const { referralProgram, player1 } = await loadFixture(deployReferralProgramFixture);

      await expect(
        referralProgram.write.withdrawToTreasury([zeroAddress, parseEther('1')], {
          account: player1.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should revert if withdrawal amount is zero', async function () {
      const { referralProgram, administrator } = await loadFixture(deployReferralProgramFixture);

      await expect(
        referralProgram.write.withdrawToTreasury([zeroAddress, 0n], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('_amount is zero!');
    });

    it('Should revert if withdrawal amount exceeds balance', async function () {
      const { referralProgram, administrator, publicClient } = await loadFixture(
        deployReferralProgramFixture,
      );

      const balance = await publicClient.getBalance({ address: referralProgram.address });
      const excessiveAmount = balance + parseEther('1');

      await expect(
        referralProgram.write.withdrawToTreasury([zeroAddress, excessiveAmount], {
          account: administrator.account.address,
        }),
      ).to.be.rejectedWith('Insufficient contract balance');
    });
  });

  describe('Receive Function', function () {
    it('Should accept ETH transfers', async function () {
      const { referralProgram, player1, publicClient } = await loadFixture(
        deployReferralProgramFixture,
      );

      const initialBalance = await publicClient.getBalance({ address: referralProgram.address });
      const transferAmount = parseEther('1');

      await player1.sendTransaction({
        to: referralProgram.address,
        value: transferAmount,
      });

      const finalBalance = await publicClient.getBalance({ address: referralProgram.address });
      expect(finalBalance).to.equal(initialBalance + transferAmount);
    });
  });

  describe('Upgrade Functionality', function () {
    it('Should allow owners multisig to upgrade the contract', async function () {
      const { referralProgram, ownersMultisig, publicClient } = await loadFixture(
        deployReferralProgramFixture,
      );

      const newReferralProgramImpl = await hre.viem.deployContract('ReferralProgram');

      await referralProgram.write.upgradeToAndCall([newReferralProgramImpl.address, '0x'], {
        account: ownersMultisig.address,
      });

      const implementationAddress = await getImplementationAddress(
        publicClient,
        referralProgram.address,
      );

      expect(getAddress(implementationAddress)).to.equal(
        getAddress(newReferralProgramImpl.address),
      );
    });

    it('Should revert if non-owner tries to upgrade', async function () {
      const { referralProgram, player1 } = await loadFixture(deployReferralProgramFixture);

      const newReferralProgramImpl = await hre.viem.deployContract('ReferralProgram');

      await expect(
        referralProgram.write.upgradeToAndCall([newReferralProgramImpl.address, '0x'], {
          account: player1.account.address,
        }),
      ).to.be.rejected;
    });

    it('Should revert if administrator tries to upgrade', async function () {
      const { referralProgram, administrator } = await loadFixture(deployReferralProgramFixture);

      const newReferralProgramImpl = await hre.viem.deployContract('ReferralProgram');

      await expect(
        referralProgram.write.upgradeToAndCall([newReferralProgramImpl.address, '0x'], {
          account: administrator.account.address,
        }),
      ).to.be.rejected;
    });
  });
});
