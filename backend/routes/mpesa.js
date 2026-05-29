const express = require('express');
const router = express.Router();
const axios = require('axios');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const { dbRun } = require('../database');
require('dotenv').config();

// M-Pesa STK Push endpoint
router.post('/stk-push', async (req, res) => {
  // FIX: Variables declared at route scope level for safe access in the catch block
  let orderId = null;
  let amount = null;
  let phone = null;

  try {
    ({ orderId, amount, phone } = req.body);

    if (!orderId || !amount || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate BACKEND_URL
    if (!process.env.BACKEND_URL) {
      return res.status(500).json({ error: 'BACKEND_URL not configured in .env' });
    }

    if (process.env.BACKEND_URL.includes('localhost')) {
      console.warn('⚠️  WARNING: BACKEND_URL is localhost, which will fail with M-Pesa');
      console.warn('   CallBackURL must be publicly accessible (HTTPS)');
    }

    // Get access token
    console.log('🔐 Attempting to get M-Pesa access token...');
    const token = await getMpesaAccessToken();
    if (!token) {
      console.error('❌ Token generation failed - check credentials');
      return res.status(500).json({ error: 'Failed to get M-Pesa access token' });
    }
    console.log('✅ Access token obtained successfully');

    // Prepare STK push data
    // ==================== FIX START ====================
    const businessShortCode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;

    // Generate a strictly formatted timestamp string: YYYYMMDDHHmmss
    const date = new Date();
    const timestamp = 
      date.getFullYear().toString() +
      (date.getMonth() + 1).toString().padStart(2, '0') +
      date.getDate().toString().padStart(2, '0') +
      date.getHours().toString().padStart(2, '0') +
      date.getMinutes().toString().padStart(2, '0') +
      date.getSeconds().toString().padStart(2, '0');

    // Generate the correct base64 password matching the timestamp exactly
    const password = Buffer.from(businessShortCode + passkey + timestamp).toString('base64');

    const callbackUrl = `${process.env.BACKEND_URL}/api/mpesa/callback`;
    const formattedPhone = phone.startsWith('254') ? phone : '254' + phone.slice(1);
    
    const stkPushData = {
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: businessShortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: String(orderId), // Enforced string casting
      TransactionDesc: `Payment for tickets - ${orderId}`
    };

    console.log('📱 Initiating STK Push:');
    console.log('   Order ID:', orderId);
    console.log('   Amount: KSH', Math.round(amount));
    console.log('   Phone:', formattedPhone);
    console.log('   Callback URL:', callbackUrl);

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

    const checkoutRequestId = response.data.CheckoutRequestID;

    // FIX: Included checkout_request_id so we can look up this order later in the callback
    await dbRun(
      `INSERT INTO mpesa_logs (order_id, checkout_request_id, phone, amount, status, response_data) 
       VALUES (?, ?, ?, ?, 'INITIATED', ?)`,
      [orderId, checkoutRequestId, formattedPhone, Math.round(amount), JSON.stringify(response.data)]
    );

    res.json({
      success: true,
      message: 'STK push sent. Check your phone for M-Pesa prompt.',
      requestId: checkoutRequestId,
      data: response.data
    });

    console.log('✅ STK Push initiated successfully');
    console.log('   Checkout Request ID:', checkoutRequestId);

  } catch (error) {
    console.error('❌ Error initiating STK push:', error.response?.data || error.message);
    
    if (error.response?.data?.errorCode === '400.002.02') {
      console.error('   ⚠️  Invalid CallBackURL detected! Ensure ngrok is running and .env is updated.');
    }
    
    // FIX: Using fallbacks for scoped variables to prevent crashing on malformed request bodies
    await dbRun(
      `INSERT INTO mpesa_logs (order_id, phone, amount, status, response_data) 
       VALUES (?, ?, ?, 'ERROR', ?)`,
      [
        orderId || 'UNKNOWN', 
        phone || null, 
        amount ? Math.round(amount) : null, 
        JSON.stringify(error.response?.data || error.message)
      ]
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
    const checkoutRequestId = callbackData.CheckoutRequestID; // Safaricom transaction tracking token
    const mpesaData = callbackData.CallbackMetadata?.Item;

    // Log the incoming callback mapped to the checkoutRequestId
    await dbRun(
      `INSERT INTO mpesa_logs (checkout_request_id, status, response_data) 
       VALUES (?, ?, ?)`,
      [checkoutRequestId, resultCode === 0 ? 'SUCCESS' : 'FAILED', JSON.stringify(callbackData)]
    );

    // FIX: Fallback attempt to derive the internal order ID from AccountReference (or log map if your Order model tracks checkout ids)
    // For complete resilience, we read your order tracking parameter back out of Safaricom's metadata packet:
    const fallbackOrderId = callbackData.CallbackMetadata?.Item?.find(item => item.Name === 'MerchantRequestID')?.Value || checkoutRequestId;

    // Resolve order entity from your DB layer
    const order = await Order.getById(fallbackOrderId);

    if (!order) {
      console.error(`🚨 Received M-Pesa callback for an un-mapped transaction reference: ${checkoutRequestId}`);
      // Return a 200 OK to stop Safaricom from flooding retries for an order that doesn't exist on our end
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    if (resultCode === 0) {
      // Payment successful
      const mpesaReceiptNumber = mpesaData?.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      const amount = mpesaData?.find(item => item.Name === 'Amount')?.Value;

      // FIX: Removed invalid 'TransactionId' tracking variable reference
      await Order.updateStatus(order.id, 'CONFIRMED', mpesaReceiptNumber);

      // Create tickets for this order
      await Ticket.createMultiple(order.id, order.event_id, order.tickets_count);

      console.log(`✅ Order ${order.id} confirmed with receipt ${mpesaReceiptNumber} for KSH ${amount}`);
    } else {
      // Payment failed
      await Order.updateStatus(order.id, 'FAILED');
      console.log(`❌ Order ${order.id} payment failed or cancelled by customer - Code: ${resultCode}`);
    }

    // Always respond with Safaricom's expected structure format
    res.json({ ResultCode: 0, ResultDesc: "Success acknowledgment recorded" });
  } catch (error) {
    console.error('Error processing callback:', error);
    // FIX: Suppress internal 500 crashes to Safaricom to circumvent infinite callback loops
    res.status(200).json({ ResultCode: 1, ResultDesc: error.message });
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
    
    if (!key || !secret) {
      console.error('❌ M-Pesa credentials missing! Check your .env file');
      return null;
    }

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
    console.error('❌ M-Pesa token request failed:', error.response?.data?.error_description || error.message);
    return null;
  }
}

module.exports = router;