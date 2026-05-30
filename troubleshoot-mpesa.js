const axios = require('axios');
require('dotenv').config();
const {
  getMpesaConfig,
  getMpesaBaseUrl,
  getMpesaTimestamp,
  buildStkPassword,
  validateMpesaConfig
} = require('./backend/mpesa-config');

async function troubleshootMpesa() {
  console.log('=== M-PESA TROUBLESHOOTING ===\n');

  const mpesa = getMpesaConfig();
  const missing = validateMpesaConfig(mpesa);

  console.log('1. CREDENTIALS FORMAT CHECK:');
  console.log('   Environment:', mpesa.environment);
  console.log('   Shortcode:', mpesa.shortcode, `(${mpesa.shortcode.length} chars)`);
  console.log('   Passkey length:', mpesa.passkey.length, 'chars');
  console.log('   Consumer Key length:', mpesa.consumerKey.length, 'chars');
  console.log('   Consumer Secret length:', mpesa.consumerSecret.length, 'chars');
  if (missing.length) {
    console.log('   ❌ Missing:', missing.join(', '));
    return;
  }

  console.log('\n2. TESTING ACCESS TOKEN:');
  try {
    const auth = Buffer.from(`${mpesa.consumerKey}:${mpesa.consumerSecret}`).toString('base64');
    const mpesaBaseUrl = getMpesaBaseUrl(mpesa.environment);

    const tokenResponse = await axios.get(
      `${mpesaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );

    console.log('   ✅ Access token obtained successfully');
    console.log('   Token (first 20 chars):', tokenResponse.data.access_token.substring(0, 20) + '...');

    console.log('\n3. PASSWORD GENERATION (Africa/Nairobi timestamp):');
    const timestamp = getMpesaTimestamp();
    const password = buildStkPassword(mpesa.shortcode, mpesa.passkey, timestamp);

    console.log('   Timestamp:', timestamp);
    console.log('   Base64 password (first 20 chars):', password.substring(0, 20) + '...');

    console.log('\n4. TESTING STK PUSH REQUEST (sandbox test phone 254708374149):');
    const testPhone = '254708374149';
    const stkPushData = {
      BusinessShortCode: mpesa.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: 1,
      PartyA: testPhone,
      PartyB: mpesa.shortcode,
      PhoneNumber: testPhone,
      CallBackURL: mpesa.backendUrl + '/api/mpesa/callback',
      AccountReference: 'TEST-001',
      TransactionDesc: 'Test payment'
    };

    console.log('   Request payload:');
    console.log('   - BusinessShortCode:', stkPushData.BusinessShortCode);
    console.log('   - Timestamp:', stkPushData.Timestamp);
    console.log('   - Amount:', stkPushData.Amount);
    console.log('   - PartyA:', stkPushData.PartyA);
    console.log('   - CallBackURL:', stkPushData.CallBackURL);

    const stkResponse = await axios.post(
      `${mpesaBaseUrl}/mpesa/stkpush/v1/processrequest`,
      stkPushData,
      {
        headers: {
          'Authorization': `Bearer ${tokenResponse.data.access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n   ✅ STK PUSH SUCCESSFUL!');
    console.log('   Response:', JSON.stringify(stkResponse.data, null, 2));

  } catch (error) {
    console.log('\n   ❌ ERROR:');
    console.log('   Status:', error.response?.status);
    console.log('   Error Code:', error.response?.data?.errorCode);
    console.log('   Error Message:', error.response?.data?.errorMessage);
    
    if (error.response?.data?.errorCode === '500.001.1001') {
      console.log('\n   DIAGNOSIS - "Wrong credentials" typically means:');
      console.log('   • Shortcode (174379) and Passkey do NOT match in Safaricom system');
      console.log('   • This shortcode is not configured for STK Push');
      console.log('   • The account has not been activated for this service');
      console.log('\n   SOLUTIONS:');
      console.log('   1. Verify shortcode and passkey match in https://developer.safaricom.co.ke/');
      console.log('   2. Ensure STK Push is enabled for this shortcode');
      console.log('   3. Contact Safaricom support if the account is not activated');
      console.log('   4. Try using a different shortcode if you have multiple');
    }
  }
}

troubleshootMpesa();
