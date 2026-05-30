/**
 * Tries known sandbox passkeys + timestamp formats. Does not print secrets.
 * Run: node scripts/mpesa-stk-diagnose.js
 */
require('dotenv').config();
const axios = require('axios');
const { getMpesaConfig, getMpesaBaseUrl, getMpesaTimestamp, buildStkPassword } = require('../backend/mpesa-config');

const KNOWN_SANDBOX_PASSKEYS = [
  'bfb279f9aa9bdbcf158e97dd1a503b6e72ada1ed2c9191c5a88346309dff624b',
  'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
  'bfb279f9aa9bdbcf158e97dd71a467cd2f2c3e6c74a35d8b22a82e1a8ed2c919'
];

function timestampIsoUtc() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function timestampLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function getToken(mpesa) {
  const auth = Buffer.from(`${mpesa.consumerKey}:${mpesa.consumerSecret}`).toString('base64');
  const base = getMpesaBaseUrl(mpesa.environment);
  const res = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` }
  });
  return res.data.access_token;
}

async function tryStk(token, shortcode, passkey, timestamp, callbackUrl) {
  const password = buildStkPassword(shortcode, passkey, timestamp);
  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: 1,
    PartyA: '254708374149',
    PartyB: shortcode,
    PhoneNumber: '254708374149',
    CallBackURL: callbackUrl,
    AccountReference: 'TEST',
    TransactionDesc: 'Test'
  };

  const base = getMpesaBaseUrl('sandbox');
  const res = await axios.post(`${base}/mpesa/stkpush/v1/processrequest`, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    validateStatus: () => true
  });

  return res.data;
}

async function main() {
  const mpesa = getMpesaConfig();
  const callbackUrl = `${mpesa.backendUrl}/api/mpesa/callback`;
  const shortcode = '174379';

  console.log('Getting access token...');
  const token = await getToken(mpesa);

  const timestamps = {
    nairobi: getMpesaTimestamp(),
    isoUtc: timestampIsoUtc(),
    local: timestampLocal()
  };

  let found = null;

  for (let i = 0; i < KNOWN_SANDBOX_PASSKEYS.length; i++) {
    for (const [tsName, ts] of Object.entries(timestamps)) {
      const label = `passkey#${i + 1}+${tsName}`;
      try {
        const data = await tryStk(token, shortcode, KNOWN_SANDBOX_PASSKEYS[i], ts, callbackUrl);
        if (data.ResponseCode === '0' || data.CheckoutRequestID) {
          console.log(`✅ SUCCESS with ${label}`);
          console.log('   Use this passkey index in .env (see script KNOWN_SANDBOX_PASSKEYS)');
          console.log('   Timestamp mode:', tsName);
          found = { passkeyIndex: i + 1, tsName };
          break;
        }
        console.log(`❌ ${label}:`, data.errorCode || data.errorMessage || data);
      } catch (e) {
        console.log(`❌ ${label}:`, e.response?.data?.errorMessage || e.message);
      }
    }
    if (found) break;
  }

  if (!found) {
    console.log('\nNo known sandbox passkey worked with your consumer key.');
    console.log('Your app likely needs its OWN passkey from Daraja:');
    console.log('  My Apps → [app] → APIs → enable "M-Pesa Express" or "Lipa Na M-Pesa Online"');
    console.log('  → Test credentials → copy the plain Passkey (not Password sample)');
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
