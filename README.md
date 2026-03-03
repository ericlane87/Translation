# VoiceBridge MVP (Web + Node STT Backend)

Google Voice-style web calling app using `HTML/CSS/JS` + Firebase + server-side STT.

## UX Flow

1. `index.html` = public marketing homepage + login entry for existing customers.
2. `auth.html` = separate auth page:
   - Login for existing customers
   - Signup for new users
   - Call ID is chosen during account creation
3. `dashboard.html` = protected user dashboard:
   - Call by typing user ID
   - Group room links for multi-party calls
   - Incoming popup with accept/reject
   - Outgoing ringing popup
   - In-call popup with controls
   - Call history with click-to-call + status badges
   - Automatic EN/ES translation during active calls

## Files

- `index.html`: public homepage
- `auth.html`: login + signup page (ID claim during signup)
- `dashboard.html`: calling dashboard + modals
- `app-config.js`: frontend runtime config (set external API base URL for static hosting)
- `styles.css`: modern UI styling
- `firebase-client.js`: Firebase initialization
- `auth.js`: login/signup logic
- `dashboard.js`: call logic, WebRTC, call logs, translation orchestration
- `server.mjs`: static server + `/api/transcribe` backend endpoint
- `.env.example`: server environment variable template
- `package.json`: backend deps/scripts
- `firebase.rules`: starter Firestore security rules
- `firebase.indexes.json`: Firestore indexes template
- `infra/coturn/docker-compose.yml`: coturn container deploy template
- `infra/coturn/turnserver.conf.example`: coturn server config template
- `scripts/generate_turn_secret.sh`: helper to generate TURN shared secret

## Run Locally

```bash
cd "projects/web-voice-translator-mvp"
npm install
cp .env.example .env
# edit .env and set:
# - OPENAI_API_KEY
# - GOOGLE_TRANSLATE_API_KEY
# - FIREBASE_PROJECT_ID
# - (recommended) GOOGLE_APPLICATION_CREDENTIALS
#   or FIREBASE_SERVICE_ACCOUNT_JSON
# - CORS_ORIGIN (required in production; comma-separated origins)
# - optional: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
# - TURN_URLS, TURN_REALM, TURN_SHARED_SECRET (+ optional TURN_TTL_SEC)
npm run check:setup
npm run dev
```

Open `http://127.0.0.1:4010`.

## GitHub Pages Prototype

GitHub Pages can host the frontend files (`.html`, `.js`, `.css`), but it cannot run `server.mjs`.
For testing with someone in another country, host backend APIs separately and point frontend to it.

1. Deploy backend (`server.mjs`) to a Node host (Render/Railway/Fly/Cloud Run).
2. Set backend environment variables (`OPENAI_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`, `FIREBASE_PROJECT_ID`, Firebase Admin credentials, TURN variables).
3. In `app-config.js`, set:
   - `API_BASE_URL: "https://your-backend-domain"`
4. On backend, allow your GitHub Pages origin in `CORS_ORIGIN`:
   - `https://<your-username>.github.io`
5. Enable GitHub Pages for this repo (Settings -> Pages -> Source: GitHub Actions).
6. Test from two devices/networks using the Pages URL.

Note: cross-country WebRTC reliability usually requires a public TURN server; STUN-only often fails across NAT/firewalls.
Note: this repo includes `.github/workflows/pages.yml` to deploy static files from `main` via GitHub Actions.

## TURN Deployment (coturn)

1. Provision a VM with a public IP.
2. Open firewall/security-group ports:
   - `3478/udp`
   - `3478/tcp`
   - `49160-49250/udp`
3. Generate shared secret:

```bash
./scripts/generate_turn_secret.sh
```

4. Configure coturn:

```bash
cd infra/coturn
cp turnserver.conf.example turnserver.conf
# edit turnserver.conf and set:
# - external-ip
# - realm
# - static-auth-secret
```

5. Start coturn:

```bash
docker compose up -d
```

6. Configure app backend `.env` with matching values:
   - `TURN_URLS=turn:<your-domain-or-ip>:3478?transport=udp,turn:<your-domain-or-ip>:3478?transport=tcp`
   - `TURN_REALM=<same-realm-as-coturn>`
   - `TURN_SHARED_SECRET=<same-static-auth-secret>`
   - optional `TURN_TTL_SEC=3600`

7. Restart the Node server.

## Firebase Setup

1. Create Firebase project.
2. Enable `Authentication -> Email/Password`.
3. Create Firestore database.
4. Ensure `firebase-client.js` values point to your Firebase web app config.
5. Set backend `.env` with `FIREBASE_PROJECT_ID` and Firebase Admin credentials:
   - preferred: `GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json`
   - or: `FIREBASE_SERVICE_ACCOUNT_JSON={...}`
6. Deploy rules/indexes (if using Firebase CLI):

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## Firestore Model

- `users/{uid}`
  - `email`
  - `callId`
  - `language`
  - `translateIncomingTo`
  - `createdAt`

- `callIds/{callId}`
  - `uid`
  - `createdAt`

- `calls/{callDocId}`
  - `callerUid`
  - `callerId`
  - `receiverUid`
  - `receiverId`
  - `status` (`ringing`, `active`, `rejected`, `ended`)
  - `offer`
  - `answer`
  - `createdAt`
  - `answeredAt`
  - `endedAt`

- `calls/{callDocId}/offerCandidates/{doc}`
- `calls/{callDocId}/answerCandidates/{doc}`

## Notes

- This is an MVP scaffold and not telecom-grade production yet.
- STT is production-style (server-side OpenAI transcription via `/api/transcribe`).
- Translation uses Google Cloud Translation API via server endpoint `/api/translate`.
- Group room mode uses Firestore paths: `rooms/{roomId}/participants/{uid}` and `rooms/{roomId}/signals/{doc}`.
- Backend API routes now require Firebase Auth bearer tokens and apply basic per-user/IP rate limits.
- Production server middleware now includes `helmet`, strict CORS allowlisting, and `trust proxy`.
- Rate limiting supports shared Redis (Upstash REST) when configured; otherwise falls back to in-memory limits.
- TURN credentials are issued by `/api/turn-credentials` using short-lived coturn REST auth credentials.
- Keep secrets only in `.env` or your platform secret manager; do not commit real keys.
