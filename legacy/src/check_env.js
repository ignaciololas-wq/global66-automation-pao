// Validador de .env. Chequea qué vars faltan según el modo.
// Uso: node src/check_env.js

import 'dotenv/config';

const MOCK = process.env.MOCK_MODE === 'true';

const REQUIRED_ALWAYS = [
  'SUPABASE_URL',
];

if (!process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY;
}
if (!process.env.GEMINI_API_KEY && process.env.GOOGLE_API_KEY) {
  process.env.GEMINI_API_KEY = process.env.GOOGLE_API_KEY;
}

const REQUIRED_REAL = [
  'GEMINI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SLACK_BOT_TOKEN',
  'SLACK_SIGNING_SECRET',
  'SLACK_COMPLIANCE_CHANNEL',
  'SLACK_LEGAL_CHANNEL',
  'SLACK_ADMIN_CHANNEL',
  'FINNECTO_BASE_URL',
  'FINNECTO_API_KEY',
  'FINNECTO_PROVIDER_FORM_ID',
  'GOOGLE_FORM_ID',
  'GOOGLE_SHEET_ID',
  'GOOGLE_DRIVE_ROOT_FOLDER',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'SIGNNOW_CLIENT_ID',
  'SIGNNOW_CLIENT_SECRET',
  'SIGNNOW_USERNAME',
  'SIGNNOW_PASSWORD',
  'SIGNNOW_TEMPLATE_ID',
  'OPENSANCTIONS_API_KEY',
];

const OPTIONAL = [
  'NOTION_API_KEY',
  'SLACK_APP_TOKEN',
  'FINECTO_URL',
  'FINECTO_USER',
  'FINECTO_PASSWORD',
];

const required = MOCK ? REQUIRED_ALWAYS : [...REQUIRED_ALWAYS, ...REQUIRED_REAL];
const missing = required.filter((k) => !process.env[k]);
const present = required.filter((k) => process.env[k]);

console.log(`Mode: ${MOCK ? 'MOCK' : 'REAL'}`);
console.log(`\nPresent (${present.length}):`);
present.forEach((k) => console.log(`  ✓ ${k}`));

console.log(`\nMissing (${missing.length}):`);
if (missing.length === 0) {
  console.log('  (none)');
} else {
  missing.forEach((k) => console.log(`  ✗ ${k}`));
}

const optionalMissing = OPTIONAL.filter((k) => !process.env[k]);
if (optionalMissing.length) {
  console.log(`\nOptional missing (${optionalMissing.length}):`);
  optionalMissing.forEach((k) => console.log(`  - ${k}`));
}

process.exit(missing.length === 0 ? 0 : 1);
