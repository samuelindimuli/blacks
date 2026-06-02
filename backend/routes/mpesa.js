const express = require('express');
const router = express.Router();
const axios = require('axios');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const { dbRun, dbGet, dbAll } = require('../database');
const {
  getMpesaConfig,
  getMpesaBaseUrl,
  getMpesaTimestampVariants,
  getMpesaTimestampNairobi,
  getMpesaTimestampUtc,
  getSandboxPasskeysToTry,
  buildStkPassword,
  formatStkFields,
  validateMpesaConfig,
  stkCredentialHint,
  stkBusyHint,
  isRetryableStkError
} = require('../mpesa-config');

const STK_MAX_RETRIES = 4;
const STK_RETRY_BASE_MS = 4000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
require('dotenv').config();
const OrderModel = require('../models/Order');

// Health check for admin dashboard and ticket scanner
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// M-Pesa STK Push endpoint
router.post('/stk-push', async (req, res) => {
  let orderId = null;
  let amount = null;
  let phone = null;

  try {
    ({ orderId, amount, phone } = req.body);

    if (!orderId || !amount || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const mpesa = getMpesaConfig();
    const missing = validateMpesaConfig(mpesa);
    if (missing.length) {
      return res.status(500).json({ error: `Missing .env: ${missing.join(', ')}` });
    }

    if (mpesa.backendUrl.includes('localhost')) {
      console.warn('⚠️  WARNING: BACKEND_URL is localhost, which will fail with M-Pesa');
      console.warn('   CallBackURL must be publicly accessible (HTTPS)');
    }

    console.log('🔐 Attempting to get M-Pesa access token...');
    const token = await getMpesaAccessToken(mpesa);
    if (!token) {
      console.error('❌ Token generation failed - check MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET');
      return res.status(500).json({ error: 'Failed to get M-Pesa access token' });
    }
    console.log('✅ Access token obtained successfully');

    const businessShortCode = String(mpesa.shortcode);
    const callbackUrl = `${mpesa.backendUrl}/api/mpesa/callback`;
    const formattedPhone = phone.startsWith('254') ? phone : '254' + phone.slice(1);
    const stkFields = formatStkFields(orderId);

    console.log('📱 Initiating STK Push:');
    console.log('   Order ID:', orderId);
    console.log('   Amount: KSH', Math.round(amount));
    console.log('   Phone:', formattedPhone);
    console.log('   Callback URL:', callbackUrl);

    const mpesaBaseUrl = getMpesaBaseUrl(mpesa.environment);
    const stkResult = await initiateStkPush({
      mpesaBaseUrl,
      token,
      businessShortCode,
      amount: Math.round(amount),
      formattedPhone,
      callbackUrl,
      stkFields,
      isSandbox: mpesa.isSandbox,
      configPasskey: mpesa.passkey
    });

    const { response, passkeyUsed, timestampMode } = stkResult;
    const checkoutRequestId = response.data.CheckoutRequestID;

    if (mpesa.isSandbox && passkeyUsed !== mpesa.passkey) {
      console.log('   ℹ️  STK succeeded with alternate sandbox passkey — update MPESA_PASSKEY in .env');
    }
    if (timestampMode) {
      console.log('   ℹ️  Timestamp mode:', timestampMode);
    }

    await Order.updateCheckoutRequestId(orderId, checkoutRequestId);

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

    const errorCode = error.response?.data?.errorCode;
    if (errorCode === '400.002.02') {
      console.error('   ⚠️  Invalid CallBackURL detected! Ensure ngrok is running and .env is updated.');
    }
    const credentialHint = stkCredentialHint(errorCode);
    const busyHint = stkBusyHint(errorCode);
    if (credentialHint) {
      console.error('   ⚠️ ', credentialHint);
    }
    if (busyHint) {
      console.warn('   ℹ️ ', busyHint);
    }

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

    const statusCode = isRetryableStkError(errorCode) ? 503 : 500;

    res.status(statusCode).json({
      error: 'Failed to initiate payment',
      details: error.response?.data?.errorMessage || error.message,
      errorCode: errorCode || undefined,
      retryable: isRetryableStkError(errorCode),
      hint: busyHint || credentialHint || undefined
    });
  }
});

// Helper to query Safaricom for the actual status of an STK Push
async function querySafaricomStatus(checkoutRequestId) {
  try {
    const mpesa = getMpesaConfig();
    const token = await getMpesaAccessToken(mpesa);
    const mpesaBaseUrl = getMpesaBaseUrl(mpesa.environment);
    const timestamp = getMpesaTimestampNairobi();
    const password = buildStkPassword(mpesa.shortcode, mpesa.passkey, timestamp);

    const queryData = {
      BusinessShortCode: mpesa.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    const response = await axios.post(
      `${mpesaBaseUrl}/mpesa/stkpushquery/v1/query`,
      queryData,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    return response.data;
  } catch (error) {
    console.error('Safaricom Query Error:', error.response?.data || error.message);
    return null;
  }
}

// Reports Endpoint - Provide real-time data to the admin dashboard
router.get('/reports/event/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    const adminToken = req.headers['x-admin-token'];

    if (adminToken !== process.env.ADMIN_TOKEN) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 1. Order Summary Stats
    const stats = await dbGet(`
      SELECT 
        COUNT(*) as totalOrders,
        SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmedOrders,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingOrders,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failedOrders,
        SUM(CASE WHEN status = 'CONFIRMED' THEN amount ELSE 0 END) as totalRevenue
      FROM orders WHERE event_id = ?
    `, [eventId]);

    // 2. Ticket Usage Stats
    const ticketStats = await dbGet(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'UNUSED' THEN 1 ELSE 0 END) as unused,
        SUM(CASE WHEN status = 'USED' THEN 1 ELSE 0 END) as used
      FROM tickets WHERE event_id = ?
    `, [eventId]);

    // 3. Breakdown of Tickets by Type
    const ticketsByTypeRaw = await dbAll(`
      SELECT ticket_type, SUM(tickets_count) as count 
      FROM orders 
      WHERE event_id = ? AND status = 'CONFIRMED'
      GROUP BY ticket_type
    `, [eventId]);
    
    const byType = {};
    ticketsByTypeRaw.forEach(row => {
      byType[row.ticket_type || 'General'] = row.count || 0;
    });

    // 4. Fetch Order Lists for the dashboard tables
    const confirmed = await dbAll(`
      SELECT order_id, phone, amount, tickets_count, ticket_type, mpesa_receipt, confirmed_at 
      FROM orders WHERE event_id = ? AND status = 'CONFIRMED' 
      ORDER BY confirmed_at DESC LIMIT 50
    `, [eventId]);

    const pending = await dbAll(`
      SELECT order_id, phone, amount, tickets_count, created_at 
      FROM orders WHERE event_id = ? AND status = 'PENDING' 
      ORDER BY created_at DESC LIMIT 20
    `, [eventId]);

    const failed = await dbAll(`
      SELECT order_id, phone, amount, failed_at 
      FROM orders WHERE event_id = ? AND status = 'FAILED' 
      ORDER BY failed_at DESC LIMIT 20
    `, [eventId]);

    res.json({
      event: {
        eventId,
        totalOrders: stats.totalOrders || 0,
        confirmedOrders: stats.confirmedOrders || 0,
        pendingOrders: stats.pendingOrders || 0,
        failedOrders: stats.failedOrders || 0
      },
      revenue: {
        total: stats.totalRevenue || 0,
        average: stats.confirmedOrders > 0 ? (stats.totalRevenue / stats.confirmedOrders) : 0,
        byStatus: { CONFIRMED: stats.totalRevenue || 0, PENDING: 0, FAILED: 0 }
      },
      tickets: {
        total: ticketStats.total || 0,
        unused: ticketStats.unused || 0,
        used: ticketStats.used || 0,
        usageRate: ticketStats.total > 0 ? ((ticketStats.used / ticketStats.total) * 100).toFixed(2) + '%' : '0.00%',
        byType
      },
      orders: { CONFIRMED: confirmed, PENDING: pending, FAILED: failed }
    });
  } catch (error) {
    console.error('Analytics Error:', error);
    res.status(500).json({ error: 'Internal server error while fetching analytics' });
  }
});

// New route to explicitly sync an order with Safaricom
router.get('/sync/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await findOrderResilient(orderId);

    if (!order || !order.checkout_request_id) {
      return res.status(404).json({ error: 'Order not found or no M-Pesa request associated with it.' });
    }

    const safaricomStatus = await querySafaricomStatus(order.checkout_request_id);
    
    if (safaricomStatus && safaricomStatus.ResultCode === '0') {
      // It's paid! Update the DB
      await Order.updateStatus(order.order_id, 'CONFIRMED', 'SYNCED-' + order.order_id.slice(-5));
      await Ticket.createMultiple(order.order_id, order.event_id, order.tickets_count);
      return res.json({ success: true, message: 'Confirmed via Safaricom Query', status: 'CONFIRMED' });
    }

    res.json({ success: false, message: safaricomStatus?.ResultDesc || 'Payment not found in Safaricom records.', status: order.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
    const checkoutRequestId = callbackData.CheckoutRequestID;
    const mpesaData = callbackData.CallbackMetadata?.Item;

    await dbRun(
      `INSERT INTO mpesa_logs (checkout_request_id, status, response_data) 
       VALUES (?, ?, ?)`,
      [checkoutRequestId, resultCode === 0 ? 'SUCCESS' : 'FAILED', JSON.stringify(callbackData)]
    );

    let order = null;

    const log = await dbGet(
      `SELECT order_id FROM mpesa_logs 
       WHERE checkout_request_id = ? AND order_id IS NOT NULL AND order_id != 'UNKNOWN'
       ORDER BY id DESC LIMIT 1`,
      [checkoutRequestId]
    );

    if (log?.order_id) {
      order = await Order.getById(log.order_id);
    }

    if (!order) {
      order = await Order.getByCheckoutRequestId(checkoutRequestId);
    }

    if (!order) {
      console.error(`🚨 M-Pesa callback for unmapped transaction: ${checkoutRequestId}`);
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const orderId = order.order_id;

    if (resultCode === 0) {
      const mpesaReceiptNumber = mpesaData?.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
      const amount = mpesaData?.find(item => item.Name === 'Amount')?.Value;

      if (order.status === 'CONFIRMED') {
        console.log(`ℹ️  Order ${orderId} already confirmed, skipping duplicate processing`);
      } else {
        await Order.updateStatus(orderId, 'CONFIRMED', mpesaReceiptNumber);
        await Ticket.createMultiple(orderId, order.event_id, order.tickets_count);
        console.log(`✅ Order ${orderId} confirmed with receipt ${mpesaReceiptNumber} for KSH ${amount}`);
      }
    } else if (order.status !== 'CONFIRMED') {
      await Order.updateStatus(orderId, 'FAILED');
      console.log(`❌ Order ${orderId} payment failed or cancelled - Code: ${resultCode}`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Success acknowledgment recorded' });
  } catch (error) {
    console.error('Error processing callback:', error);
    res.status(200).json({ ResultCode: 1, ResultDesc: error.message });
  }
});

// Helper for fuzzy order lookup
async function findOrderResilient(id) {
  if (!id) return null;
  const cleanId = id.trim().toUpperCase();
  
  // 1. Try exact match (Order ID)
  let order = await Order.getById(cleanId);
  if (order) return order;

  // 2. Try match as CheckoutRequestID
  order = await Order.getByCheckoutRequestId(cleanId);
  if (order) return order;

  // 3. Fuzzy match: If user missed the hyphen (e.g., ORD123 vs ORD-123)
  if (cleanId.startsWith('ORD') && !cleanId.includes('-')) {
    const withHyphen = cleanId.replace('ORD', 'ORD-');
    order = await Order.getById(withHyphen);
    if (order) return order;
  }

  return null;
}

// Check payment status
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(`🔍 [Status Check] Querying order: ${orderId}`);
    
    const order = await findOrderResilient(orderId);

    if (!order) {
      console.warn(`⚠️ [Status Check] Order ID ${orderId} not found in database.`);
      return res.status(404).json({ error: `Order ID "${orderId}" not found. Please ensure you include any hyphens (e.g., ORD-123).` });
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

// Manual Payment Verification
router.post('/verify-manual', async (req, res) => {
  try {
    const { orderId, mpesaCode } = req.body;
    const finalMpesaCode = (mpesaCode || 'MANUAL-CONFIRM').trim().toUpperCase();

    console.log(`🛠️ [Manual Verification] Attempting for Order: ${orderId}, M-Pesa Code: ${finalMpesaCode}`);

    if (!orderId) {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    const order = await findOrderResilient(orderId);

    if (!order) {
      console.warn(`⚠️ [Manual Verification] Order not found: ${orderId}`);
      return res.status(404).json({ error: `Order ID "${orderId}" not found. Manual verification requires a valid existing order.` });
    }

    if (order.status === 'CONFIRMED') {
      return res.json({ success: true, message: 'Order already confirmed', orderId });
    }

    // REAL CHECK: Try to verify with Safaricom before force-confirming
    if (order.checkout_request_id) {
      const safaricomStatus = await querySafaricomStatus(order.checkout_request_id);
      if (safaricomStatus && safaricomStatus.ResultCode === '0') {
        console.log(`✅ Safaricom verified payment for ${orderId}`);
      } else {
        console.warn(`⚠️ Safaricom has no record of success for ${orderId}. Proceeding with manual override.`);
      }
    }

    // Log the manual verification attempt for auditing
    await dbRun(
      `INSERT INTO mpesa_logs (order_id, status, response_data) 
       VALUES (?, 'MANUAL_CONFIRMED', ?)`,
      [orderId, JSON.stringify({ mpesaCode: finalMpesaCode, timestamp: new Date().toISOString() })]
    );

    // Update order status and generate tickets
    await Order.updateStatus(orderId, 'CONFIRMED', finalMpesaCode);
    await Ticket.createMultiple(orderId, order.event_id, order.tickets_count);

    console.log(`✅ Order ${orderId} manually confirmed with code ${finalMpesaCode}`);

    res.json({
      success: true,
      message: 'Payment verified and tickets generated',
      orderId
    });
  } catch (error) {
    console.error('Error in manual verification:', error);
    res.status(500).json({ error: error.message });
  }
});

async function postStkRequest(mpesaBaseUrl, token, stkPushData) {
  return axios.post(`${mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`, stkPushData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
}

async function attemptStkPush({
  mpesaBaseUrl,
  token,
  businessShortCode,
  passkey,
  timestampMode,
  timestamp,
  amount,
  formattedPhone,
  callbackUrl,
  stkFields
}) {
  const password = buildStkPassword(businessShortCode, passkey, timestamp);
  const stkPushData = {
    BusinessShortCode: businessShortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: formattedPhone,
    PartyB: businessShortCode,
    PhoneNumber: formattedPhone,
    CallBackURL: callbackUrl,
    AccountReference: stkFields.AccountReference,
    TransactionDesc: stkFields.TransactionDesc
  };

  const response = await postStkRequest(mpesaBaseUrl, token, stkPushData);

  if (response.data?.CheckoutRequestID || response.data?.ResponseCode === '0') {
    return { response, passkeyUsed: passkey, timestampMode };
  }

  const err = new Error(response.data?.errorMessage || 'STK push failed');
  err.response = { data: response.data };
  throw err;
}

async function initiateStkPush({
  mpesaBaseUrl,
  token,
  businessShortCode,
  amount,
  formattedPhone,
  callbackUrl,
  stkFields,
  isSandbox,
  configPasskey
}) {
  const passkeys = isSandbox ? getSandboxPasskeysToTry(configPasskey) : [configPasskey];
  const timestampModes = getMpesaTimestampVariants();
  let lastError = null;

  for (const passkey of passkeys) {
    for (const { name: timestampMode } of timestampModes) {
      for (let attempt = 1; attempt <= STK_MAX_RETRIES; attempt++) {
        const timestamp =
          timestampMode === 'utc' ? getMpesaTimestampUtc() : getMpesaTimestampNairobi();

        try {
          return await attemptStkPush({
            mpesaBaseUrl,
            token,
            businessShortCode,
            passkey,
            timestampMode,
            timestamp,
            amount,
            formattedPhone,
            callbackUrl,
            stkFields
          });
        } catch (error) {
          lastError = error;
          const code = error.response?.data?.errorCode;

          if (isRetryableStkError(code) && attempt < STK_MAX_RETRIES) {
            const waitMs = STK_RETRY_BASE_MS * attempt;
            console.warn(
              `   ⏳ M-Pesa busy (${code}), retry ${attempt}/${STK_MAX_RETRIES - 1} in ${waitMs / 1000}s...`
            );
            await sleep(waitMs);
            continue;
          }

          if (code === '500.001.1001') {
            break;
          }

          throw error;
        }
      }
    }
  }

  throw lastError;
}

async function getMpesaAccessToken(mpesaConfig) {
  try {
    const mpesa = mpesaConfig || getMpesaConfig();
    const { consumerKey: key, consumerSecret: secret, environment } = mpesa;

    if (!key || !secret) {
      console.error('❌ M-Pesa credentials missing! Check your .env file');
      return null;
    }

    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    const mpesaBaseUrl = getMpesaBaseUrl(environment);

    const response = await axios.get(
      `${mpesaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`
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
