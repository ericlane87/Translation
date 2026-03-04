import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import admin from 'firebase-admin';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 7 * 1024 * 1024 },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const sttModel = process.env.OPENAI_STT_MODEL || 'gpt-4o-mini-transcribe';
const googleTranslateApiKey = process.env.GOOGLE_TRANSLATE_API_KEY || '';
const port = Number(process.env.PORT || 4010);
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID || '';
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const corsOrigins = buildCorsOrigins(process.env.CORS_ORIGIN || '');
const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL || '';
const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const hasRedisRateStore = Boolean(redisRestUrl && redisRestToken);
const turnSharedSecret = process.env.TURN_SHARED_SECRET || '';
const turnRealm = process.env.TURN_REALM || '';
const turnTtlSec = Math.max(60, Number(process.env.TURN_TTL_SEC || 3600));
const turnUrls = parseTurnUrls(process.env.TURN_URLS || '');
const hasOpenAiKey = !looksLikePlaceholder(process.env.OPENAI_API_KEY || '');
const hasGoogleTranslateKey = !looksLikePlaceholder(googleTranslateApiKey);
const hasTurnConfig = isTurnConfigured({
  sharedSecret: turnSharedSecret,
  realm: turnRealm,
  urls: turnUrls,
});

initFirebaseAdmin();

const rateStore = new Map();
const appTtlTimer = setInterval(pruneRateStore, 60_000);
appTtlTimer.unref?.();

app.set('trust proxy', isProduction ? 1 : false);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (!isProduction) {
        cb(null, true);
        return;
      }
      if (corsOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error('CORS origin denied'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'authorization'],
    maxAge: 86_400,
  })
);

function initFirebaseAdmin() {
  if (admin.apps.length) return;

  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
  if (serviceAccountRaw) {
    const parsed = JSON.parse(serviceAccountRaw);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
      ...(firebaseProjectId ? { projectId: firebaseProjectId } : {}),
    });
    return;
  }

  admin.initializeApp(
    firebaseProjectId
      ? {
          credential: admin.credential.applicationDefault(),
          projectId: firebaseProjectId,
        }
      : {
          credential: admin.credential.applicationDefault(),
        }
  );
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '');
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return '';
  return parts[1].trim();
}

async function requireFirebaseAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Missing bearer token' });
      return;
    }
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid auth token' });
  }
}

function applyRateLimit(options) {
  const { keyPrefix, limit, windowMs } = options;

  return async (req, res, next) => {
    const uid = req.user?.uid || 'anon';
    const ip = String(
      req.headers['x-forwarded-for'] ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown'
    );
    const clientKey = ip.split(',')[0].trim();
    const key = `${keyPrefix}:${uid}:${clientKey}`;

    try {
      const verdict = hasRedisRateStore
        ? await rateWithRedis(key, limit, windowMs)
        : rateInMemory(key, limit, windowMs);

      if (!verdict.allowed) {
        res.setHeader('Retry-After', String(verdict.retryAfterSec));
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }
      next();
    } catch {
      res.status(503).json({ error: 'Rate limiting unavailable' });
    }
  };
}

function rateInMemory(key, limit, windowMs) {
  const now = Date.now();
  const existing = rateStore.get(key);

  if (!existing || now >= existing.resetAt) {
    rateStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

async function rateWithRedis(key, limit, windowMs) {
  const incrBody = JSON.stringify([['INCR', key]]);
  const incrResp = await fetch(redisRestUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${redisRestToken}`,
      'content-type': 'application/json',
    },
    body: incrBody,
  });

  if (!incrResp.ok) {
    throw new Error('Redis INCR failed');
  }

  const incrData = await incrResp.json();
  const count = Number(incrData?.result || 0);

  if (count === 1) {
    const expireBody = JSON.stringify([['PEXPIRE', key, String(windowMs)]]);
    await fetch(redisRestUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${redisRestToken}`,
        'content-type': 'application/json',
      },
      body: expireBody,
    });
  }

  if (count > limit) {
    const ttlResp = await fetch(redisRestUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${redisRestToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([['PTTL', key]]),
    });
    const ttlData = ttlResp.ok ? await ttlResp.json() : null;
    const ttlMs = Math.max(1000, Number(ttlData?.result || 1000));
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(ttlMs / 1000)),
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

function pruneRateStore() {
  const now = Date.now();
  for (const [key, value] of rateStore.entries()) {
    if (now >= value.resetAt) {
      rateStore.delete(key);
    }
  }
}

function parseOrigins(value) {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function buildCorsOrigins(value) {
  const configured = parseOrigins(value);
  const defaults = [
    'https://ericlane87.github.io',
    'http://localhost:4010',
    'http://127.0.0.1:4010',
  ];
  return Array.from(new Set([...configured, ...defaults]));
}

function parseTurnUrls(value) {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function looksLikePlaceholder(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  return [
    'your_',
    'replace_',
    'paste_',
    '<your',
    'your-turn-host',
    'your_turn_host',
    'your_openai',
  ].some((token) => normalized.includes(token));
}

function isTurnConfigured(payload) {
  const { sharedSecret, realm, urls } = payload;
  if (!sharedSecret || !realm || !urls.length) return false;
  if (looksLikePlaceholder(sharedSecret) || looksLikePlaceholder(realm)) return false;
  return !urls.some((url) => looksLikePlaceholder(url));
}

app.post(
  '/api/transcribe',
  requireFirebaseAuth,
  applyRateLimit({ keyPrefix: 'transcribe', limit: 40, windowMs: 60_000 }),
  upload.single('audio'),
  async (req, res) => {
  try {
    if (!hasOpenAiKey) {
      res.status(503).json({ error: 'Transcription unavailable: missing OPENAI_API_KEY' });
      return;
    }

    if (!req.file || !req.file.buffer?.length) {
      res.status(400).json({ error: 'Missing audio file' });
      return;
    }

    const requestedLang = String(req.body?.lang || '').toLowerCase();
    const language = requestedLang === 'es' ? 'es' : 'en';

    const sourceFile = await toFile(
      req.file.buffer,
      req.file.originalname || 'chunk.webm',
      { type: req.file.mimetype || 'audio/webm' }
    );

    const result = await openai.audio.transcriptions.create({
      model: sttModel,
      file: sourceFile,
      language,
      response_format: 'text',
    });

    const text = String(result || '').trim();
    res.json({ text });
  } catch (err) {
    const message = err?.message || 'Transcription failed';
    res.status(500).json({ error: message });
  }
  }
);

app.post(
  '/api/translate',
  requireFirebaseAuth,
  applyRateLimit({ keyPrefix: 'translate', limit: 120, windowMs: 60_000 }),
  async (req, res) => {
  try {
    if (!hasGoogleTranslateKey) {
      res.status(500).json({ error: 'Missing GOOGLE_TRANSLATE_API_KEY' });
      return;
    }

    const text = String(req.body?.text || '').trim();
    const fromRaw = String(req.body?.from || '').toLowerCase();
    const toRaw = String(req.body?.to || '').toLowerCase();
    const source = fromRaw === 'es' ? 'es' : 'en';
    const target = toRaw === 'es' ? 'es' : 'en';

    if (!text) {
      res.status(400).json({ error: 'Missing text' });
      return;
    }

    if (source === target) {
      res.json({ translatedText: text });
      return;
    }

    const url = new URL('https://translation.googleapis.com/language/translate/v2');
    url.searchParams.set('key', googleTranslateApiKey);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        q: text,
        source,
        target,
        format: 'text',
      }),
    });

    if (!resp.ok) {
      const details = await resp.text();
      res.status(502).json({ error: `Translate API failed: ${details.slice(0, 180)}` });
      return;
    }

    const data = await resp.json();
    const translatedText = String(
      data?.data?.translations?.[0]?.translatedText || text
    ).trim();
    res.json({ translatedText });
  } catch (err) {
    const message = err?.message || 'Translation failed';
    res.status(500).json({ error: message });
  }
  }
);

app.get(
  '/api/turn-credentials',
  requireFirebaseAuth,
  applyRateLimit({ keyPrefix: 'turn', limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      if (!hasTurnConfig) {
        res.status(503).json({ error: 'TURN is not configured' });
        return;
      }

      const nowSec = Math.floor(Date.now() / 1000);
      const expiresAt = nowSec + turnTtlSec;
      const username = `${expiresAt}:${req.user.uid}`;
      const credential = crypto
        .createHmac('sha1', turnSharedSecret)
        .update(username)
        .digest('base64');

      res.json({
        expiresAt,
        ttlSec: turnTtlSec,
        iceServers: [
          { urls: ['stun:stun.l.google.com:19302'] },
          { urls: turnUrls, username, credential },
        ],
      });
    } catch (err) {
      const message = err?.message || 'TURN credential generation failed';
      res.status(500).json({ error: message });
    }
  }
);

app.use(express.static(__dirname));

app.get('*', (req, res) => {
  if (req.path.endsWith('.html')) {
    res.sendFile(path.join(__dirname, req.path));
    return;
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

function logStartupConfiguration() {
  const warnings = [];
  if (!hasOpenAiKey) warnings.push('OPENAI_API_KEY missing/placeholder: /api/transcribe will be unavailable.');
  if (!hasGoogleTranslateKey) warnings.push('GOOGLE_TRANSLATE_API_KEY missing/placeholder: /api/translate will be unavailable.');
  if (!firebaseProjectId) warnings.push('FIREBASE_PROJECT_ID missing: set it to your Firebase project for reliable token verification.');
  if (!hasTurnConfig) warnings.push('TURN config missing/placeholder: relay connectivity may fail for many networks.');
  if (isProduction && !corsOrigins.length) warnings.push('CORS_ORIGIN not set in production: browser API calls may be blocked.');

  if (!warnings.length) {
    console.log('Startup config check: OK');
    return;
  }

  console.warn('Startup config check:');
  warnings.forEach((item) => console.warn(`- ${item}`));
}

logStartupConfiguration();

app.listen(port, () => {
  console.log(`VoiceBridge server listening on http://127.0.0.1:${port}`);
});
