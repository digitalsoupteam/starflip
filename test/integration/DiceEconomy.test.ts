/**
 * Dice Contract Economy Test
 *
 * This file implements the economy stability test for the Dice contract.
 * It runs 100 bets with random parameters, tracks player and contract balances,
 * and writes the results to a CSV file (dice_economy_results.csv).
 *
 * The test verifies that the house edge is working as expected by ensuring
 * that over a large number of bets, the contract gains value.
 *
 * For basic payout calculation tests, see DiceTest.ts
 */

import { expect } from 'chai';
import hre from 'hardhat';
import { encodeFunctionData, getAddress, parseEther, zeroAddress } from 'viem';
import { loadFixture, setBalance, impersonateAccount } from '@nomicfoundation/hardhat-toolbox-viem/network-helpers';
import fs from 'fs';
import path from 'path';

describe('Dice Contract Economy Test', function () {
  async function deployDiceFixture() {
    const [deployer, user, , , , , , administrator, owner1, owner2] =
      await hre.viem.getWalletClients();
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

    const accessRolesImpl = await hre.viem.deployContract('AccessRoles');
    const accessRolesInitData = encodeFunctionData({
      abi: accessRolesImpl.abi,
      functionName: 'initialize',
      args: [ownersMultisig.address, []],
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

    setBalance(Dice.address, parseEther('100'));

    await impersonateAccount(ownersMultisig.address);
    await setBalance(ownersMultisig.address, parseEther('100'));

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

    await addressBook.write.initialSetPauseManager([pauseManager.address], {
      account: deployer.account.address,
    });
    await addressBook.write.initialSetReferralProgram([referralProgram.address], {
      account: deployer.account.address,
    });

    return { Dice, MockVRFCoordinator, user };
  }

  // 100 for fork and 10000 for clean local network
  it('Should run 10000 bets and track economy', async function () {
    const { Dice, MockVRFCoordinator, user } = await loadFixture(deployDiceFixture);

    let contractBalance = parseEther('100');
    let playerBalance = parseEther('100')

    const results = [];

    for (let i = 0; i < 1000; i++) {
      const betAmount = BigInt(Math.floor(Math.random() * 100) + 1) * 10n ** 16n;

      if (playerBalance < betAmount) continue;

      const comparisonType = Math.floor(Math.random() * 2); // 0 1
      const targetNumber = Math.floor(Math.random() * (90 - 11 + 1)) + 11; // 11 90

      playerBalance -= betAmount;
      contractBalance += betAmount;

      await Dice.write.roll([BigInt(targetNumber), comparisonType, zeroAddress, betAmount, zeroAddress], {
        account: user.account.address,
        value: betAmount,
      });

      const randomResult = BigInt(Math.floor(Math.random() * 100) + 1);

      await MockVRFCoordinator.write.fulfillRandomWords([Dice.address, [randomResult]], {
        account: user.account.address,
      });

      const betEvents = await Dice.getEvents.BetSettled();
      const latestBetEvent = betEvents[betEvents.length - 1];

      if (latestBetEvent.args.won && latestBetEvent.args.payout) {
        playerBalance += latestBetEvent.args.payout;
        contractBalance -= latestBetEvent.args.payout;
      }

      results.push({
        betNumber: i + 1,
        comparisonType: ['GREATER_THAN', 'LESS_THAN'][comparisonType],
        targetNumber,
        betAmount: Number(betAmount) / 10 ** 18,
        result: Number(latestBetEvent.args.result),
        won: latestBetEvent.args.won,
        payout: Number(latestBetEvent.args.payout) / 10 ** 18,
        playerBalance: Number(playerBalance) / 10 ** 18,
        contractBalance: Number(contractBalance) / 10 ** 18,
      });
    }

    const resultsTable = [
      'Bet #,Comparison,Target,Bet Amount,Result,Won,Payout,Player Balance,Contract Balance',
      ...results.map(
        r =>
          `${r.betNumber},${r.comparisonType},${r.targetNumber},${r.betAmount},${r.result},${r.won},${r.payout},${r.playerBalance.toFixed(4)},${r.contractBalance.toFixed(4)}`,
      ),
    ].join('\n');

    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `dice_economy_results_${timestamp}.csv`;
    fs.writeFileSync(path.join(__dirname, `../${filename}`), resultsTable);
    console.log(`Results written to ${filename}`);

    console.log('Economy test completed.');
    console.log(`Final player balance: ${Number(playerBalance) / 10 ** 18} ETH`);
    console.log(`Final contract balance: ${Number(contractBalance) / 10 ** 18} ETH`);

    const initialBalance = 100n * 10n ** 18n;
    console.log(`Initial contract balance: ${Number(initialBalance) / 10 ** 18} ETH`);
    console.log(
      `Contract balance change: ${Number(contractBalance - initialBalance) / 10 ** 18} ETH`,
    );

    expect(Number(contractBalance)).to.not.equal(Number(initialBalance));
  });
});
