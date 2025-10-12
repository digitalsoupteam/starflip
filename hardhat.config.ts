import 'dotenv/config';
import type { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox-viem';
import '@typechain/hardhat';

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.28',
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 1337,
      forking: {
        url: 'https://rpc.ankr.com/base/941b1cae95390eb99b9b5aad2dfc41f101929436551ebbbae0883bf32a49e6e6',
        blockNumber: 36109389,
      },
      blockGasLimit: 30_000_000,
      initialBaseFeePerGas: 0,
      accounts: {
        count: 10,
      },
      loggingEnabled: false,
    },
    baseSepolia: {
      url: 'https://sepolia.base.org',
      chainId: 84532,
      accounts: [process.env.PRIVATE_KEY!],
      ignition: {
        explorerUrl: 'https://sepolia.basescan.org/',
      },
    },
  },
};

export default config;
