const express = require('express');
const BlockchainService = require('../config/blockchain');
const router = express.Router();

module.exports = (db) => {
  const blockchain = new BlockchainService();

  router.get('/config', (req, res) => {
    const config = blockchain.getConfig();
    res.json({
      network: config.name,
      chainId: config.chainId,
      explorerUrl: config.explorerUrl,
      usdt: {
        address: config.usdt.address,
        symbol: config.usdt.symbol,
        decimals: config.usdt.decimals
      }
    });
  });

  router.get('/usdt/balance/:address', async (req, res) => {
    const { address } = req.params;

    if (!blockchain.isValidAddress(address)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    try {
      const balance = await blockchain.getUSDTBalance(address);
      res.json({
        address,
        balance: parseFloat(balance),
        symbol: 'USDT',
        network: blockchain.getConfig().name
      });
    } catch (error) {
      console.error('Balance check error:', error);
      res.status(500).json({ error: 'Failed to get balance' });
    }
  });

  router.post('/verify-payment', async (req, res) => {
    const { txHash, expectedAmount, paymentAddress } = req.body;

    if (!txHash || !expectedAmount) {
      return res.status(400).json({ error: 'Transaction hash and expected amount required' });
    }

    if (!blockchain.isValidTxHash(txHash)) {
      return res.status(400).json({ error: 'Invalid transaction hash format' });
    }

    try {
      const verification = await blockchain.verifyTransaction(txHash);

      if (!verification.verified) {
        return res.status(400).json({ 
          error: 'Transaction verification failed',
          details: verification.error 
        });
      }

      const amountMatch = Math.abs(verification.amount - expectedAmount) < 0.01;
      const addressMatch = !paymentAddress || 
        verification.to.toLowerCase() === paymentAddress.toLowerCase();

      if (!amountMatch) {
        return res.status(400).json({
          error: 'Payment amount mismatch',
          expected: expectedAmount,
          received: verification.amount
        });
      }

      if (!addressMatch) {
        return res.status(400).json({
          error: 'Payment address mismatch',
          expected: paymentAddress,
          received: verification.to
        });
      }

      db.db.run(`
        INSERT OR IGNORE INTO blockchain_transactions (
          tx_hash, from_address, to_address, amount, 
          block_number, verified_at, status
        ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'verified')
      `, [
        txHash,
        verification.from,
        verification.to,
        verification.amount,
        verification.blockNumber
      ]);

      res.json({
        verified: true,
        transaction: {
          hash: txHash,
          from: verification.from,
          to: verification.to,
          amount: verification.amount,
          blockNumber: verification.blockNumber,
          explorerUrl: blockchain.getExplorerUrl('tx', txHash)
        }
      });

    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({ error: 'Payment verification failed' });
    }
  });

  router.get('/transaction/:txHash', async (req, res) => {
    const { txHash } = req.params;

    if (!blockchain.isValidTxHash(txHash)) {
      return res.status(400).json({ error: 'Invalid transaction hash format' });
    }

    try {
      const details = await blockchain.getTransactionDetails(txHash);
      
      if (!details) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      res.json({
        ...details,
        explorerUrl: blockchain.getExplorerUrl('tx', txHash)
      });
    } catch (error) {
      console.error('Transaction details error:', error);
      res.status(500).json({ error: 'Failed to get transaction details' });
    }
  });

  router.post('/generate-address', (req, res) => {
    try {
      const wallet = blockchain.generatePaymentAddress();
      res.json({
        address: wallet.address,
        network: blockchain.getConfig().name,
        explorerUrl: blockchain.getExplorerUrl('address', wallet.address)
      });
    } catch (error) {
      console.error('Address generation error:', error);
      res.status(500).json({ error: 'Failed to generate payment address' });
    }
  });

  router.get('/gas-price', async (req, res) => {
    try {
      const gasPrice = await blockchain.provider.getFeeData();
      
      res.json({
        gasPrice: {
          standard: gasPrice.gasPrice ? ethers.formatUnits(gasPrice.gasPrice, 'gwei') : null,
          fast: gasPrice.maxFeePerGas ? ethers.formatUnits(gasPrice.maxFeePerGas, 'gwei') : null,
          network: blockchain.getConfig().name
        }
      });
    } catch (error) {
      console.error('Gas price error:', error);
      res.status(500).json({ error: 'Failed to get gas price' });
    }
  });

  router.get('/block/latest', async (req, res) => {
    try {
      const blockNumber = await blockchain.provider.getBlockNumber();
      const block = await blockchain.provider.getBlock(blockNumber);
      
      res.json({
        blockNumber,
        timestamp: block.timestamp,
        hash: block.hash,
        transactionCount: block.transactions.length,
        explorerUrl: blockchain.getExplorerUrl('block', blockNumber)
      });
    } catch (error) {
      console.error('Latest block error:', error);
      res.status(500).json({ error: 'Failed to get latest block' });
    }
  });

  return router;
};