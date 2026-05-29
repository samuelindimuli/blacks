const axios = require('axios');
require('dotenv').config();

async function troubleshootMpesa() {
  console.log('=== M-PESA TROUBLESHOOTING ===\n');

  // 1. Check credentials format
  console.log('1. CREDENTIALS FORMAT CHECK:');
  console.log('   Shortcode:', process.env.MPESA_SHORTCODE, `(${process.env.MPESA_SHORTCODE.length} chars)`);
  console.log('   Passkey length:', process.env.MPESA_PASSKEY.length, 'chars');
  console.log('   Consumer Key length:', process.env.MPESA_CONSUMER_KEY.length, 'chars');
  console.log('   Consumer Secret length:', process.env.MPESA_CONSUMER_SECRET.length, 'chars');

  // 2. Test access token
  console.log('\n2. TESTING ACCESS TOKEN:');
  try {
    const key = process.env.MPESA_CONSUMER_KEY;
    const secret = process.env.MPESA_CONSUMER_SECRET;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');

    const tokenResponse = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${auth}`
        }
      }
    );

    console.log('   ✅ Access token obtained successfully');
    console.log('   Token (first 20 chars):', tokenResponse.data.access_token.substring(0, 20) + '...');
    
    // 3. Generate password
    console.log('\n3. PASSWORD GENERATION:');
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const businessShortCode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const passwordString = businessShortCode + passkey + timestamp;
    const password = Buffer.from(passwordString).toString('base64');

    console.log('   Timestamp:', timestamp);
    console.log('   Password string length:', passwordString.length);
    console.log('   Base64 password (first 20 chars):', password.substring(0, 20) + '...');

    // 4. Test STK Push request
    console.log('\n4. TESTING STK PUSH REQUEST:');
    const stkPushData = {
      BusinessShortCode: businessShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: 1,
      PartyA: '254791615005',
      PartyB: businessShortCode,
      PhoneNumber: '254791615005',
      CallBackURL: process.env.BACKEND_URL + '/api/mpesa/callback',
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
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
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
