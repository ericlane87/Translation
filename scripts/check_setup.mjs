import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env');

if (!fs.existsSync(envPath)) {
  console.error('Missing .env file. Copy .env.example to .env first.');
  process.exit(1);
}

const parsed = dotenv.parse(fs.readFileSync(envPath, 'utf8'));

function value(key) {
  return String(parsed[key] || '').trim();
}

function placeholderLike(raw) {
  const v = raw.toLowerCase();
  if (!v) return true;
  return [
    'your_',
    'replace_',
    'paste_',
    '<your',
    'your-turn-host',
    'your_turn_host',
    'example.com',
  ].some((token) => v.includes(token));
}

function report(label, ok, detail) {
  const icon = ok ? 'OK ' : 'MISS';
  console.log(`${icon}  ${label}${detail ? ` - ${detail}` : ''}`);
  return ok;
}

let allGood = true;

const openAiKey = value('OPENAI_API_KEY');
const googleTranslateKey = value('GOOGLE_TRANSLATE_API_KEY');
const firebaseProjectId = value('FIREBASE_PROJECT_ID');
const turnUrls = value('TURN_URLS');
const turnRealm = value('TURN_REALM');
const turnSecret = value('TURN_SHARED_SECRET');

allGood = report('OPENAI_API_KEY', !placeholderLike(openAiKey), 'required for STT') && allGood;
allGood = report('GOOGLE_TRANSLATE_API_KEY', !placeholderLike(googleTranslateKey), 'required for translation') && allGood;
allGood = report('FIREBASE_PROJECT_ID', !placeholderLike(firebaseProjectId), 'required for backend token verification') && allGood;

const turnConfigured = !placeholderLike(turnUrls) && !placeholderLike(turnRealm) && !placeholderLike(turnSecret);
report('TURN configuration', turnConfigured, 'recommended for real-world call reliability');

if (!allGood) {
  console.error('\nCritical setup is incomplete. Update .env and rerun: npm run check:setup');
  process.exit(1);
}

console.log('\nCritical setup looks good.');
