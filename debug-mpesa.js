require('dotenv').config();

const orderId = 'ORD-TEST-DEBUG';
const amount = 1999;
const phone = '254791615005';

// Check credentials
console.log('=== CREDENTIALS CHECK ===');
console.log('MPESA_SHORTCODE:', process.env.MPESA_SHORTCODE);
console.log('MPESA_SHORTCODE length:', process.env.MPESA_SHORTCODE?.length);
console.log('MPESA_PASSKEY:', process.env.MPESA_PASSKEY);
console.log('MPESA_PASSKEY length:', process.env.MPESA_PASSKEY?.length);

// Generate timestamp
const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
console.log('\n=== TIMESTAMP ===');
console.log('Generated timestamp:', timestamp);
console.log('Timestamp length:', timestamp.length);

// Generate password
const businessShortCode = process.env.MPESA_SHORTCODE;
const passkey = process.env.MPESA_PASSKEY;
const passwordString = businessShortCode + passkey + timestamp;
const password = Buffer.from(passwordString).toString('base64');

console.log('\n=== PASSWORD CALCULATION ===');
console.log('Password string:', passwordString);
console.log('Password string length:', passwordString.length);
console.log('Base64 password:', password);

// Test payload
const stkPushData = {
  BusinessShortCode: businessShortCode,
  Password: password,
  Timestamp: timestamp,
  TransactionType: 'CustomerPayBillOnline',
  Amount: Math.round(amount),
  PartyA: phone.startsWith('254') ? phone : '254' + phone.slice(1),
  PartyB: businessShortCode,
  PhoneNumber: phone.startsWith('254') ? phone : '254' + phone.slice(1),
  CallBackURL: `${process.env.BACKEND_URL}/api/mpesa/callback`,
  AccountReference: orderId,
  TransactionDesc: `Payment for tickets - ${orderId}`
};

console.log('\n=== STK PUSH PAYLOAD ===');
console.log(JSON.stringify(stkPushData, null, 2));
