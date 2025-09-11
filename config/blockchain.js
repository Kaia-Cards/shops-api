const { ethers } = require('ethers');

const KAIA_CONFIG = {
  MAINNET: {
    chainId: 8217,
    name: 'Kaia Mainnet',
    rpcUrl: 'https://public-en.node.kaia.io',
    explorerUrl: 'https://kaiascan.io',
    usdt: {
      address: '0xd077a400968890eacc75cdc901f0356c943e4fdb',
      decimals: 6,
      symbol: 'USDT'
    }
  },
  TESTNET: {
    chainId: 1001,
    name: 'Kaia Testnet (Kairos)',
    rpcUrl: 'https://public-en-kairos.node.kaia.io',
    explorerUrl: 'https://kairos.kaiascan.io',
    usdt: {
      address: '0x5c74070fdea071359b86082bd9f9b3deaafbe32b',
      decimals: 6,
      symbol: 'USDT'
    }
  }
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
];

class BlockchainService {
  constructor() {
    this.network = process.env.NODE_ENV === 'production' ? 'MAINNET' : 'TESTNET';
    this.config = KAIA_CONFIG[this.network];
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.usdtContract = new ethers.Contract(
      this.config.usdt.address,
      ERC20_ABI,
      this.provider
    );
  }

  getConfig() {
    return this.config;
  }

  async getUSDTBalance(address) {
    try {
      const balance = await this.usdtContract.balanceOf(address);
      return ethers.formatUnits(balance, this.config.usdt.decimals);
    } catch (error) {
      console.error('Error getting USDT balance:', error);
      throw new Error('Failed to get USDT balance');
    }
  }

  async verifyTransaction(txHash) {
    try {
      const tx = await this.provider.getTransaction(txHash);
      if (!tx) {
        throw new Error('Transaction not found');
      }

      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      if (receipt.status !== 1) {
        throw new Error('Transaction failed');
      }

      if (tx.to.toLowerCase() !== this.config.usdt.address.toLowerCase()) {
        throw new Error('Transaction not sent to USDT contract');
      }

      const logs = receipt.logs.filter(log => 
        log.address.toLowerCase() === this.config.usdt.address.toLowerCase()
      );

      if (logs.length === 0) {
        throw new Error('No USDT transfer events found');
      }

      const transferLog = logs.find(log => {
        try {
          const parsedLog = this.usdtContract.interface.parseLog(log);
          return parsedLog.name === 'Transfer';
        } catch (e) {
          return false;
        }
      });

      if (!transferLog) {
        throw new Error('USDT Transfer event not found');
      }

      const parsedTransfer = this.usdtContract.interface.parseLog(transferLog);
      const amount = ethers.formatUnits(parsedTransfer.args.value, this.config.usdt.decimals);

      return {
        verified: true,
        from: parsedTransfer.args.from,
        to: parsedTransfer.args.to,
        amount: parseFloat(amount),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: tx.timestamp || Date.now()
      };

    } catch (error) {
      console.error('Transaction verification failed:', error);
      return {
        verified: false,
        error: error.message
      };
    }
  }

  async getTransactionDetails(txHash) {
    try {
      const [tx, receipt] = await Promise.all([
        this.provider.getTransaction(txHash),
        this.provider.getTransactionReceipt(txHash)
      ]);

      if (!tx || !receipt) {
        return null;
      }

      const block = await this.provider.getBlock(receipt.blockNumber);

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: ethers.formatEther(tx.value),
        gasPrice: ethers.formatUnits(tx.gasPrice, 'gwei'),
        gasUsed: receipt.gasUsed.toString(),
        status: receipt.status === 1 ? 'success' : 'failed',
        blockNumber: receipt.blockNumber,
        timestamp: block.timestamp,
        confirmations: await tx.confirmations()
      };
    } catch (error) {
      console.error('Error getting transaction details:', error);
      return null;
    }
  }

  generatePaymentAddress() {
    const wallet = ethers.Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic.phrase
    };
  }

  isValidAddress(address) {
    try {
      return ethers.isAddress(address);
    } catch (error) {
      return false;
    }
  }

  isValidTxHash(hash) {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  }

  formatAmount(amount, decimals = 6) {
    return parseFloat(amount).toFixed(decimals);
  }

  parseAmount(amount, decimals = 6) {
    return ethers.parseUnits(amount.toString(), decimals);
  }

  getExplorerUrl(type, value) {
    const baseUrl = this.config.explorerUrl;
    switch (type) {
      case 'tx':
        return `${baseUrl}/tx/${value}`;
      case 'address':
        return `${baseUrl}/address/${value}`;
      case 'block':
        return `${baseUrl}/block/${value}`;
      default:
        return baseUrl;
    }
  }
}

module.exports = BlockchainService;