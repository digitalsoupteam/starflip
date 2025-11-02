import { parseEther } from 'viem';
import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { network } from 'hardhat';

import addressBookModule from '../access/AddressBook';

export default buildModule('DiceModule', m => {
  const config = {
    hardhat: {
      subscriptionId: 1,
      vrfCoordinatorAddress: '0x0000000000000000000000000000000000000000',
      keyHashes: '0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef'
    },
    baseSepolia: {
      subscriptionId: BigInt("34952386452544774831036623393685127576818139619478014201666995682771803052374"),
      vrfCoordinatorAddress: '0x5C210eF41CD1a72de73bF76eC39637bB0d3d7BEE',
      keyHashes: '0x9e1344a1247c8a1785d0a4681a27152bffdb43666ae5bf7d14d24a5efd44bf71'
    },
    base: {
      subscriptionId: -1,
      vrfCoordinatorAddress: '',
      keyHashes: ''
    },
  };

  const networkName = network.name as keyof typeof config;

  if (!(networkName in config)) throw new Error(`No owners defined for network: ${networkName}`);

  const { addressBookProxy } = m.useModule(addressBookModule);

  let vrfCoordinatorAddress;

  if (networkName === 'hardhat') {
    vrfCoordinatorAddress = m.contract('MockVRFCoordinator');
  } else {
    vrfCoordinatorAddress = config[networkName].vrfCoordinatorAddress;
  }

  const impl = m.contract('Dice', [vrfCoordinatorAddress]);
  const initData = m.encodeFunctionCall(impl, 'initialize', [
    vrfCoordinatorAddress,
    config[networkName].subscriptionId,
    config[networkName].keyHashes,
    addressBookProxy,
    1,
    100,
    parseEther('0.001'),
    parseEther('1'),
    10,
  ]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);

  return { diceImpl: impl, diceProxy: proxy };
});
