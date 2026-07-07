/** M-Pesa Daraja config — credentials, timestamps, STK password */

const SANDBOX_SHORTCODE = '174379';

/** Known sandbox passkeys (Daraja docs / samples — try if app-specific key fails) */
const SANDBOX_PASSKEYS = [
  'bfb279f9aa9bdbcf158e97dd1a503b6e72ada1ed2c9191c5a88346309dff624b',
  'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
  'bfb279f9aa9bdbcf158e97dd71a467cd2f2c3e6c74a35d8b22a82e1a8ed2c919'
];

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getBackendUrl() {
  const explicit = trim(process.env.BACKEND_URL);
  if (explicit) return explicit;

  const railwayDomain = trim(process.env.RAILWAY_PUBLIC_DOMAIN);
  if (railwayDomain) return `https://${railwayDomain}`;

  return '';
}

function getMpesaConfig() {
  const environment = trim(process.env.MPESA_ENVIRONMENT) || 'sandbox';
  const isSandbox = environment !== 'production';
  const passkey = trim(process.env.MPESA_PASSKEY);

  return {
    environment,
    isSandbox,
    consumerKey: trim(process.env.MPESA_CONSUMER_KEY),
    consumerSecret: trim(process.env.MPESA_CONSUMER_SECRET),
    shortcode: trim(process.env.MPESA_SHORTCODE) || (isSandbox ? SANDBOX_SHORTCODE : ''),
    passkey: passkey || (isSandbox ? SANDBOX_PASSKEYS[0] : ''),
    backendUrl: getBackendUrl()
  };
}

function getSandboxPasskeysToTry(configPasskey) {
  const list = configPasskey ? [configPasskey, ...SANDBOX_PASSKEYS] : [...SANDBOX_PASSKEYS];
  return [...new Set(list.filter(Boolean))];
}

function getMpesaBaseUrl(environment) {
  return environment === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

/** YYYYMMDDHHmmss — Africa/Nairobi */
function getMpesaTimestampNairobi() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const pick = (type) => parts.find((p) => p.type === type)?.value || '00';
  return `${pick('year')}${pick('month')}${pick('day')}${pick('hour')}${pick('minute')}${pick('second')}`;
}

/** YYYYMMDDHHmmss — UTC (common in Daraja Node samples) */
function getMpesaTimestampUtc() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function getMpesaTimestamp() {
  const mode = trim(process.env.MPESA_TIMESTAMP_MODE) || 'nairobi';
  if (mode === 'utc') return getMpesaTimestampUtc();
  return getMpesaTimestampNairobi();
}

function getMpesaTimestampVariants() {
  return [
    { name: 'nairobi', value: getMpesaTimestampNairobi() },
    { name: 'utc', value: getMpesaTimestampUtc() }
  ];
}

function buildStkPassword(shortcode, passkey, timestamp) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

/** Safaricom STK field limits */
function formatStkFields(orderId) {
  const ref = String(orderId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'TICKETS';
  return {
    AccountReference: ref,
    TransactionDesc: 'TicketPay'
  };
}

function looksLikeEncodedPassword(passkey) {
  if (!passkey || passkey.length < 80) return false;
  return passkey.endsWith('=') || passkey.endsWith('==');
}

function validateMpesaConfig(config) {
  const missing = [];
  if (!config.consumerKey) missing.push('MPESA_CONSUMER_KEY');
  if (!config.consumerSecret) missing.push('MPESA_CONSUMER_SECRET');
  if (!config.shortcode) missing.push('MPESA_SHORTCODE');
  if (!config.passkey) missing.push('MPESA_PASSKEY');
  if (!config.backendUrl) missing.push('BACKEND_URL');

  if (config.passkey && looksLikeEncodedPassword(config.passkey)) {
    console.error(
      '❌ MPESA_PASSKEY looks like base64 Password from docs. Use plain Passkey from Daraja Test credentials.'
    );
  }

  return missing;
}

function stkCredentialHint(errorCode) {
  if (errorCode !== '500.001.1001') return null;
  return (
    'STK password rejected. Your Consumer Key/Secret and Passkey must come from the SAME Daraja app: ' +
    'developer.safaricom.co.ke → My Apps → [your app] → APIs → enable "M-Pesa Express" (STK Push) → ' +
    'Test credentials → copy plain Passkey (short text, not base64 Password). ' +
    'Run: npm run mpesa:diagnose'
  );
}

/** Safaricom transient errors — credentials are usually fine; retry after a short wait */
const RETRYABLE_STK_ERROR_CODES = new Set([
  '500.003.02', // System is busy
  '500.003.03',
  '17', // Internal failure
  '26' // System busy (alternate)
]);

function isRetryableStkError(errorCode) {
  return RETRYABLE_STK_ERROR_CODES.has(String(errorCode));
}

function stkBusyHint(errorCode) {
  if (!isRetryableStkError(errorCode)) return null;
  return (
    'M-Pesa sandbox is temporarily busy (your credentials are OK). ' +
    'Wait 1–2 minutes and try again. Avoid rapid repeated checkout attempts.'
  );
}

module.exports = {
  getMpesaConfig,
  getMpesaBaseUrl,
  getMpesaTimestamp,
  getMpesaTimestampNairobi,
  getMpesaTimestampUtc,
  getMpesaTimestampVariants,
  getSandboxPasskeysToTry,
  buildStkPassword,
  formatStkFields,
  validateMpesaConfig,
  stkCredentialHint,
  stkBusyHint,
  isRetryableStkError,
  RETRYABLE_STK_ERROR_CODES,
  SANDBOX_PASSKEYS,
  SANDBOX_SHORTCODE
};
