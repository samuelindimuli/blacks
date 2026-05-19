const express = require('express');
const router = express.Router();
const axios = require('axios');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const { dbRun } = require('../database');
require('dotenv').config();

// M-Pesa STK Push endpoint
router.post('/stk-push', async (req, res) => {
  try {
    const { orderId, amount, phone } = req.body;

    if (!orderId || !amount || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get access token
    const token = await getMpesaAccessToken();
    if (!token) {
      return res.status(500).json({ error: 'Failed to get M-Pesa access token' });
    }

    // Prepare STK push data
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
    const businessShortCode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const password = Buffer.from(businessShortCode + passkey + timestamp).toString('base64');

    const stkPushData = {
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: phone.startsWith('254') ? phone : '254' + phone.slice(1),
      PartyB: businessShortCode,
      PhoneNumber: phone.startsWith('254') ? phone : '254' + phone.slice(1),
      CallBackURL: `${process.env.FRONTEND_URL}/api/mpesa/callback`,
      AccountReference: orderId,
      TransactionDesc: `Payment for tickets - ${orderId}`
    };

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkPushData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Log the request
    await dbRun(
      `INSERT INTO mpesa_logs (order_id, phone, amount, status, response_data) 
       VALUES (?, ?, ?, 'INITIATED', ?)`,
      [orderId, phone, amount, JSON.stringify(response.data)]
    );

    res.json({
      success: true,
      message: 'STK push sent. Check your phone for M-Pesa prompt.',
      requestId: response.data.RequestId,
      data: response.data
    });

  } catch (error) {
    console.error('Error initiating STK push:', error.response?.data || error.message);
    
    await dbRun(
      `INSERT INTO mpesa_logs (order_id, phone, amount, status, response_data) 
       VALUES (?, ?, ?, 'ERROR', ?)`,
      [req.body.orderId, req.body.phone, req.body.amount, JSON.stringify(error.response?.data || error.message)]
    );

    res.status(500).json({ 
      error: 'Failed to initiate payment',
      details: error.response?.data?.errorMessage || error.message
    });
  }
});

// M-Pesa Callback endpoint
router.post('/callback', async (req, res) => {
  try {
    const callbackData = req.body.Body?.stkCallback;

    if (!callbackData) {
      return res.status(400).json({ error: 'Invalid callback data' });
    }

    const resultCode = callbackData.ResultCode;
    const orderId = callbackData.CheckoutRequestID;
    const mpesaData = callbackData.CallbackMetadata?.Item;

    // Log callback
    await dbRun(
      `INSERT INTO mpesa_logs (order_id, status, response_data) 
       VALUES (?, ?, ?)`,
      [orderId, resultCode === 0 ? 'SUCCESS' : 'FAILED', JSON.stringify(callbackData)]
    );

    if (resultCode === 0) {
      // Payment successful
      const mpesaReceiptNumber = mpesaData?.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      const transactionId = mpesaData?.find(item => item.Name === 'TransactionId')?.Value;
      const amount = mpesaData?.find(item => item.Name === 'Amount')?.Value;

      // Update order status
      const order = await Order.getById(orderId);
      if (order) {
        await Order.updateStatus(orderId, 'CONFIRMED', mpesaReceiptNumber, transactionId);

        // Create tickets for this order
        await Ticket.createMultiple(orderId, order.event_id, order.tickets_count);

        console.log(`✅ Order ${orderId} confirmed with receipt ${mpesaReceiptNumber}`);
      }
    } else {
      // Payment failed
      await Order.updateStatus(orderId, 'FAILED');
      console.log(`❌ Order ${orderId} payment failed - Code: ${resultCode}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error processing callback:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check payment status
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.getById(orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      orderId,
      status: order.status,
      mpesaReceipt: order.mpesa_receipt,
      amount: order.amount,
      phone: order.phone,
      confirmedAt: order.confirmed_at
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get M-Pesa access token (sandbox)
async function getMpesaAccessToken() {
  try {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');

    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error('Error getting M-Pesa token:', error.message);
    return null;
  }
}

module.exports = router;
