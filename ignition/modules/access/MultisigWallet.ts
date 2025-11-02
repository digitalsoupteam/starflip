import { buildModule } from '@nomicfoundation/hardhat-ignition/modules';
import { network } from 'hardhat';

export default buildModule('MultisigWalletModule', m => {
  const owners = {
    hardhat: [
      '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
      '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    ],
    baseSepolia: ['0xca15ed9b4f11cc7a19fd978ce3605f209d4e27f8', '0x5a0d2032e0558e56d53c7574fcc2d94b303d6b5b'],
    base: []
  };

  const networkName = network.name as keyof typeof owners;

  if (!(networkName in owners)) throw new Error(`No owners defined for network: ${networkName}`);

  const impl = m.contract('MultisigWallet');
  const initData = m.encodeFunctionCall(impl, 'initialize', [owners[networkName].length, owners[networkName]]);
  const proxy = m.contract('ERC1967Proxy', [impl, initData]);

  return { multisigProxy: proxy, multisigImpl: impl };
});
