const express = require('express');
const LineIntegration = require('../services/line-integration');

const router = express.Router();

module.exports = (db, fulfillmentService, providers) => {
  const lineIntegration = new LineIntegration(db, fulfillmentService, providers);

  router.post('/payment-confirmed/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { txHash, amount } = req.body;

      const order = await db.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      await db.updateOrder(orderId, {
        status: 'paid',
        tx_hash: txHash,
        payment_confirmed_at: new Date().toISOString()
      });

      if (order.line_user_id) {
        await lineIntegration.sendMessage(order.line_user_id, {
          type: 'text',
          text: `✅ Payment confirmed!\nTx: ${txHash}\nProcessing your gift card...`
        });
      }

      await lineIntegration.fulfillOrderIfPaid(orderId);

      res.json({ success: true });
    } catch (error) {
      console.error('Payment confirmation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/order-fulfilled/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { cardCode, pinCode } = req.body;

      const order = await db.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      await db.updateOrder(orderId, {
        status: 'completed',
        card_codes: cardCode,
        pin_codes: pinCode,
        fulfilled_at: new Date().toISOString()
      });

      if (order.line_user_id) {
        await lineIntegration.sendOrderNotification(order.line_user_id, {
          ...order,
          status: 'completed',
          card_code: cardCode,
          pin_code: pinCode
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error('Order fulfillment error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};