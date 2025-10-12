import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { network } from 'hardhat';

import addressBookModule from '../access/AddressBook';
import { ETH, CHAINLINK_ETH_BASE, CHAINLINK_ETH_SEPOLIA } from '../../../constants/addresses';

export default buildModule('TokensManagerModule', m => {
  const { addressBookProxy } = m.useModule(addressBookModule);
  const impl = m.contract('TokensManager');
  const PRICERS = {
    hardhat: [CHAINLINK_ETH_BASE],
    baseSepolia: [CHAINLINK_ETH_SEPOLIA],
  };

  if (!(network.name in PRICERS)) throw new Error(`No pricers defined for network: ${network.name}`);
  
  const initData = m.encodeFunctionCall(impl, 'initialize', [
    addressBookProxy,
    [ETH],
    PRICERS[network.name as keyof typeof PRICERS]
  ]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);
  const addressBook = m.contractAt('AddressBook', addressBookProxy);
  m.call(addressBook, 'initialSetTokensManager', [proxy]);
  return { tokensManagerProxy: proxy, tokensManagerImpl: impl };
});
