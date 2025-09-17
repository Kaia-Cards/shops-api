const express = require('express');
const LinePayService = require('../services/line-pay');
const LineIntegration = require('../services/line-integration');

const router = express.Router();

module.exports = (db) => {
  const linePay = new LinePayService();
  const lineIntegration = new LineIntegration(db);

  router.post('/create/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const order = await db.getOrder(orderId);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const payment = await linePay.createPayment(order);

      await db.updateOrder(orderId, {
        line_pay_transaction_id: payment.transactionId,
        payment_method: 'LINE_PAY'
      });

      if (order.line_user_id) {
        const paymentMessage = linePay.createPaymentButton(
          payment.transactionId,
          payment.paymentUrl
        );
        await lineIntegration.sendMessage(order.line_user_id, paymentMessage);
      }

      res.json({
        success: true,
        transactionId: payment.transactionId,
        paymentUrl: payment.paymentUrl,
        paymentUrlApp: payment.paymentUrlApp
      });
    } catch (error) {
      console.error('LINE Pay creation error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/confirm', async (req, res) => {
    try {
      const { transactionId, orderId } = req.query;

      if (!transactionId || !orderId) {
        return res.status(400).json({ error: 'Missing parameters' });
      }

      const order = await db.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const confirmation = await linePay.confirmPayment(
        transactionId,
        orderId,
        order.price
      );

      await db.updateOrder(orderId, {
        status: 'paid',
        payment_confirmed_at: new Date().toISOString(),
        line_pay_reg_key: confirmation.regKey
      });

      if (order.line_user_id) {
        await lineIntegration.sendOrderNotification(order.line_user_id, {
          ...order,
          status: 'paid'
        });
      }

      res.redirect(`https://kshop.com/order/success?orderId=${orderId}`);
    } catch (error) {
      console.error('LINE Pay confirmation error:', error);
      res.redirect(`https://kshop.com/order/failed?error=${encodeURIComponent(error.message)}`);
    }
  });

  router.get('/cancel', async (req, res) => {
    try {
      const { orderId } = req.query;

      if (orderId) {
        await db.updateOrder(orderId, {
          status: 'cancelled',
          cancelled_at: new Date().toISOString()
        });

        const order = await db.getOrder(orderId);
        if (order && order.line_user_id) {
          await lineIntegration.sendMessage(order.line_user_id, {
            type: 'text',
            text: '❌ Payment cancelled. Your order has been cancelled.'
          });
        }
      }

      res.redirect('https://kshop.com/order/cancelled');
    } catch (error) {
      console.error('LINE Pay cancellation error:', error);
      res.redirect('https://kshop.com/');
    }
  });

  router.post('/refund/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { amount } = req.body;

      const order = await db.getOrder(orderId);
      if (!order || !order.line_pay_transaction_id) {
        return res.status(404).json({ error: 'Order not found or not paid with LINE Pay' });
      }

      const refund = await linePay.refundPayment(
        order.line_pay_transaction_id,
        amount || order.price
      );

      await db.updateOrder(orderId, {
        status: 'refunded',
        refund_transaction_id: refund.refundTransactionId,
        refunded_at: refund.refundTransactionDate
      });

      if (order.line_user_id) {
        await lineIntegration.sendMessage(order.line_user_id, {
          type: 'text',
          text: `💰 Refund processed successfully!\nAmount: ${amount || order.price} THB\nTransaction: ${refund.refundTransactionId}`
        });
      }

      res.json({
        success: true,
        refundTransactionId: refund.refundTransactionId
      });
    } catch (error) {
      console.error('LINE Pay refund error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  router.get('/status/:transactionId', async (req, res) => {
    try {
      const { transactionId } = req.params;
      const status = await linePay.checkPaymentStatus(transactionId);

      res.json({
        success: true,
        status
      });
    } catch (error) {
      console.error('LINE Pay status error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};