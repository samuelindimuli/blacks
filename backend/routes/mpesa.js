const express = require('express');
const router = express.Router();
const axios = require('axios');
const Order = require('../models/Order');
const Ticket = require('../models/Ticket');
const { dbRun, dbGet } = require('../database');
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
