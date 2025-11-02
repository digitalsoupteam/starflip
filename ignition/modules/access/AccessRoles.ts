import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import multisigWalletModule from './MultisigWallet';
import { network } from 'hardhat';

export default buildModule('AccessRolesModule', m => {
  const administrators = {
    hardhat: ['0x14dC79964da2C08b23698B3D3cc7Ca32193d9955'],
    baseSepolia: ['0x107fdb05d90e54d695a2a01ea5d921c81faa9f62'],
    base: []
  };
  const networkName = network.name as keyof typeof administrators;
  console.log(networkName)

  if (!(networkName in administrators)) throw new Error(`No owners defined for network: ${networkName}`);

  const { multisigProxy } = m.useModule(multisigWalletModule);
  const impl = m.contract('AccessRoles');
  const initData = m.encodeFunctionCall(impl, 'initialize', [multisigProxy, administrators[networkName]]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);

  return { accessRolesProxy: proxy, accessRolesImpl: impl };
});
