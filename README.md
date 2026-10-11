# MindMesh — Student Mindset Matching & Connection Platform

A privacy-first, verified-student-only platform where university students build a **mindset profile**, discover compatible peers through a **structured compatibility engine**, mutually match, and chat in real time. Not a dating clone: it is built around friendship, study partners, gaming partners, and mindset compatibility.

## Core principles

| Principle | Implementation |
|---|---|
| **Verified** | University email-domain check + email verification + unique HMAC-hashed student ID (one ID = one account) |
| **Private** | Student ID / email are never exposed; per-field visibility (Everyone / Compatible matches / Mutual matches / Nobody); anonymous alias before match |
| **Mutual** | Chat unlocks only after a mutual match; enforced in Firestore rules |
| **User controlled** | Privacy Center, discovery modes (Visible / Limited / Invisible) |
| **Safe** | Block, report (optional evidence), unmatch, hide profile, delete account |
| **Compatibility-focused** | Weighted deterministic scoring; popularity and appearance are not inputs |

## Tech stack

React + Vite + Tailwind CSS v4 + Framer Motion + Lucide + Recharts + React Router · Node.js + Express · Firebase Auth, Firestore, Storage, Admin SDK · Firestore realtime listeners for chat and notifications · pluggable AI service (OpenAI-compatible, with a built-in heuristic fallback).

**The compatibility score always comes from the deterministic engine, never from the AI.** The AI only words explanations and icebreakers, receives the minimum data (category percentages and shared interest labels), never sees IDs, emails, bios or messages, and its output is validated (certainty/judgment language is rejected and replaced by heuristic text).

## Architecture

```
├── client/src/
│   ├── firebase/auth.jsx      Firebase init (IndexedDB persistence), AuthContext, API client (token attach + refresh)
│   ├── components/index.jsx   UI primitives, toasts, modals, layout, notifications listener, route guards
│   ├── pages/                 public · onboarding · main (dashboard/discover/matches/lab/icebreakers)
│   │                          · profile · chat · settings · admin  (all behind the login wall are lazy-loaded)
│   └── lib/constants.js
├── server/src/
│   ├── index.js               Express app: helmet, CORS allowlist, rate limits, error handler
│   ├── firebase.js            Admin SDK boot (503s cleanly if unconfigured)
│   ├── config/constants.js    Enums, default weights, thresholds
│   ├── models/schemas.js      zod validation for every request body
│   ├── middleware/auth.js     Token verification (revocation checked), RBAC, validation helper
│   ├── services/
│   │   ├── matchingEngine.js    Hard filters + weighted scoring (pure, unit-tested)
│   │   ├── aiMatchingService.js calculateCompatibility / generateCompatibilityExplanation / generateIcebreaker
│   │   ├── privacy.js           Per-field visibility + anonymous aliases
│   │   ├── recommendations.js   Builds privacy-filtered cards, caches explanations
│   │   ├── studentId.js         normalize → HMAC → uniqueness key; email domain check
│   │   ├── lab.js               Compatibility Lab questions + comparison
│   │   └── data.js              Config cache, block/seen sets, notifications, audit log, batch deletes
│   ├── routes/                api.js (mounts all) · auth · profile · discovery · matches · safety · lab · account · admin
│   ├── seed.js                Universities + weights (+ opt-in demo data)
│   └── test/engine.test.js
├── firestore.rules · firestore.indexes.json · storage.rules · firebase.json
└── .env.example
```

### Firestore collections

`users` (private account) · `profiles` · `universities` · `studentIds` (server-only, HMAC as doc ID) · `matches` · `conversations` + `messages/{convId}/items` · `likes` · `passes` · `blocks` · `reports` · `notifications` · `compatibilityResults` (server-only cache) · `labs` · `adminLogs` · `config/matching` (weights)

### How the key flows work

- **Register:** validate → email must match the university domain → HMAC the student ID → reserve it with an atomic `create()` (duplicate ⇒ 409) → create the Auth user → write `users` + `profiles`. The client then sends the verification email; `POST /api/auth/sync-verification` promotes the profile to *Verified Student* once Firebase reports the email verified.
- **Discovery:** hard filters (verified, active, onboarded, 18+, not blocked, not previously liked/passed, not invisible, age/gender/university/department preferences **applied in both directions**, goal overlap, deal-breakers) → weighted score → `LIMITED` profiles only appear at 75%+ → top 5 returned (max 10), never an endless feed.
- **Mutual match:** "Interested" writes a like; the other person is not told who. When both likes exist, a transaction creates the match + conversation. Unmatch/block flip `active=false`, which the security rules use to cut off sending *and* reading.
- **Privacy:** other users' profiles are never readable from Firestore by clients; they are served by the API after hard filters and per-field visibility are applied.

## Getting started

```bash
cd server && npm install && cd ../client && npm install
```

1. Create a Firebase project; enable **Email/Password** auth, **Firestore**, **Storage**.
2. Project settings → Service accounts → generate a key (for the server). Register a **Web app** (for the client).
3. Environment:
   ```bash
   cp .env.example client/.env   # fill VITE_FIREBASE_*
   cp .env.example server/.env   # fill FIREBASE_* and STUDENT_ID_PEPPER (long random string; never change after launch)
   ```
4. Deploy rules + indexes: `firebase deploy --only firestore:rules,firestore:indexes,storage`
5. Seed universities and weights: `cd server && npm run seed` (demo profiles only with `ALLOW_DEMO_DATA=true`; they are flagged `demo:true` and have sign-in disabled)
6. Run: `cd server && npm run dev` (:4000) and `cd client && npm run dev` (:5173, proxies `/api`).
7. Make yourself an admin:
   ```bash
   node -e "const a=require('firebase-admin');a.initializeApp({credential:a.credential.cert(require('./serviceAccountKey.json'))});a.auth().setCustomUserClaims('YOUR_UID',{role:'SUPER_ADMIN'}).then(()=>console.log('done'))"
   ```
   (sign out and in again so the new claim is in your token). `UNIVERSITY_ADMIN` also needs a `universityId` claim; SUPER_ADMINs can assign roles via `PUT /api/admin/users/:uid/role`.

## Commands

| | |
|---|---|
| `server: npm run dev / start / seed / test` | API with reload / production / seed data / unit tests |
| `client: npm run dev / build / preview` | dev server / production build / serve build |

## AI configuration

Without `AI_API_KEY` everything works on the deterministic engine plus heuristic wording (templates over real shared interests, not fake scores). With `AI_API_KEY` (+ optional `AI_BASE_URL`, `AI_MODEL`) an OpenAI-compatible provider writes explanations/icebreakers. Language is cautious ("You may have good compatibility because…"); the AI never judges people or comments on health.

## Security

- Every `/api` call verifies a Firebase ID token server-side with revocation checks; admin routes check `role` claims (`SUPER_ADMIN` / `MODERATOR` / `UNIVERSITY_ADMIN`, the last scoped to its university).
- Firestore rules: default deny; participants-only conversations/messages (while active); message create/update/soft-delete constraints; typing flag only; `studentIds`, `adminLogs`, `config`, `likes`, `passes`, `compatibilityResults`, `labs` are server-only.
- zod validation on every body, request size cap, rate limits (global, register, like/pass, reports, account deletion), helmet, CORS allowlist, no secrets in the repo, no tokens in localStorage (IndexedDB persistence).
- Admins **cannot browse conversations**. A report includes message excerpts only if the reporter opts in (last 10 messages). Sensitive lookups (email) are SUPER_ADMIN-only, need a reason, and are audit-logged; every admin action is logged.

## Privacy notes

- Raw student IDs are never stored; an HMAC-SHA256 (per university) is the uniqueness key.
- Only a "✓ Verified Student" badge is shown, never verification details.
- Account deletion removes profile, matches, conversations/messages, likes, passes, blocks, notifications, lab data, photos and the login. Retained: reports involving the user, and the ID hash only for suspended accounts (ban-evasion protection).
- The Compatibility Lab is presented strictly as a fun feature, never as scientific or psychological testing.

## Production deployment

Build the client (`npm run build`) and host `client/dist` (Firebase Hosting or any CDN) with `/api` routed to the server (reverse proxy or Cloud Run). Set `CLIENT_ORIGIN` to the production origin(s), keep `.env` in your host's secret manager, enable Firebase App Check, and run the server behind HTTPS (`trust proxy` is set to 1).

## Known limitations / roadmap

- Candidate pool is capped at 300 profiles per request (fine for a campus; shard by university/department for scale).
- Message notifications use a client "ping" endpoint instead of a Cloud Function; moving this to a Firestore trigger would be more robust.
- Legal pages are templates; have counsel review before launch.
- Roadmap: university communities (study/gaming groups, clubs, events), photo verification, group chat, report-triage alerts.

## Development rule

No fake functionality: scores come from the real engine, chat is real Firestore realtime, demo data is isolated and opt-in. If a feature has no backend, the UI says so instead of pretending.
