# Panther

Live math tutoring for kids in grades 2–4. Parents book on the site, pay with Stripe, and a Panther tutor joins
the family's Google Meet. One free 25‑minute trial per family, then $19 per 40‑minute session (both in `src/config.ts`).

- **Site + booking:** Next.js 16 (App Router, TypeScript, Tailwind v4) on Netlify
- **Data + auth + uploads:** Supabase (Postgres with row‑level security, email one‑time codes, private storage)
- **Payments:** Stripe Checkout + webhooks (the webhook is the only thing that confirms a booking)
- **Meetings:** Google Meet REST API (open‑access space per session) with a Calendar `conferenceData` fallback, plus a calendar invite
- **Tutor:** Recall.ai bot whose camera renders `/bridge`, talking to the tutor agent over LiveKit; optional `realtime/` frames relay
- **Email / alerts:** Resend / Twilio
- **Motion:** GSAP (ScrollTrigger, SplitText) + Lenis, loaded after first paint, fully disabled under `prefers-reduced-motion`

See `PLAN.md` for architecture, data model and open questions, and `TEST_CHECKLIST.md` for the manual test pass.

---

## 1. Local setup

```bash
git clone <this repo> && cd panther
npm install --legacy-peer-deps      # (plain `npm install` works too once the lockfile exists)
cp .env.example .env.local          # fill in the keys you have; the site runs without most of them
npm run dev                         # http://localhost:3000
```

Everything that a non‑developer might change (prices, session lengths, business hours, capacity, trial on/off, brand
colors, support email, legal entity) lives in **`src/config.ts`**. Secrets live only in env vars (`.env.example` lists
every key with a comment).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` · `npm run typecheck` | ESLint · `next typegen && tsc` |
| `npm test` | Vitest: unit tests + the booking engine against an in‑memory Postgres (PGlite) |
| `npm run test:e2e` | Playwright: builds, starts the site and runs browser tests (axe, CLS, flows) |
| `npm run check` | lint + typecheck + test + build |
| `npm run db:seed` | Seeds a Supabase project with two families, sessions, recaps, admin data |

---

## 2. Supabase

1. Create a project. Copy the URL, the publishable (anon) key and the secret (service‑role) key into `.env.local`.
2. Run the migrations, in order, in the SQL editor (or `supabase db push` if you use the CLI):
   - `supabase/migrations/0001_init.sql` — tables, constraints, RLS, booking functions
   - `supabase/migrations/0002_storage.sql` — private `notes` bucket + policies
3. **Auth → Providers → Email:** keep "Confirm email" on. The site signs parents in with a 6‑digit code (`signInWithOtp`),
   so set **Email OTP length** to 6 and make sure the "Magic Link" template includes `{{ .Token }}` so the code appears in
   the email (the link in the same email also works: it lands on `/auth/callback`).
4. **Auth → URL configuration:** Site URL = your domain; add `https://<domain>/auth/callback` and `http://localhost:3000/auth/callback` to redirect URLs.
5. `npm run db:seed` to load test data (needs `SUPABASE_SECRET_KEY`).

Double booking is impossible at the database level: `sessions` has an exclusion constraint per seat on
`[starts_at, ends_at + buffer)`, and `book_slot()` tries seats 1…`maxSimultaneous` inside one transaction.
`trial_claims` stores keyed hashes of the parent email (gmail‑normalized), phone and the Stripe card fingerprint; they
survive data deletion so a family can't get a second free trial.

---

## 3. Stripe

1. Put `STRIPE_SECRET_KEY` (test mode first) in `.env.local`.
2. Create a webhook endpoint for `https://<domain>/api/stripe/webhook` with these events:
   `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`.
   Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

Paid sessions use Checkout in `payment` mode; the free trial uses `setup` mode ($0) so Stripe can give us the card
fingerprint. Nothing is ever confirmed from the success page — only from the webhook, which is idempotent by event id.

---

## 4. Google Workspace (Meet + Calendar)

1. In Google Cloud, enable the **Google Meet REST API** and **Google Calendar API**.
2. Create a service account, create a JSON key, and enable **domain‑wide delegation** for it.
3. In the Workspace Admin console → Security → API controls → Domain‑wide delegation, add the service account's client ID with scopes:
   `https://www.googleapis.com/auth/meetings.space.created`, `https://www.googleapis.com/auth/calendar.events`.
4. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (the whole JSON on one line), `GOOGLE_IMPERSONATE_USER` (a real Workspace user, e.g.
   `sessions@yourdomain.com`, whose calendar will own the events) and `GOOGLE_CALENDAR_ID` (`primary`).

Each confirmed session gets its own Meet space with `accessType: OPEN`, so the tutor bot can join without a host.
If the Meet API call fails we fall back to a Calendar event with `conferenceData`.

---

## 5. Recall.ai, LiveKit and the tutor agent

- `RECALL_API_KEY`, `RECALL_REGION`: the bot is scheduled at confirmation time with `join_at = start − 2 min` (always > 10 min
  ahead, so it's a guaranteed scheduled bot). Its camera renders `https://<domain>/bridge?session=…&t=<signed token>`.
- Add a Recall **status‑change webhook** pointing at `https://<domain>/api/recall/webhook` and put the workspace
  verification secret (or the endpoint's Svix secret) in `RECALL_WEBHOOK_SECRET`.
- `LIVEKIT_URL/API_KEY/API_SECRET`: `/bridge` and the agent both mint tokens from `POST /api/livekit/token`.
  Room name = session id; the bridge publishes meeting audio and plays the agent's voice track.
- `AGENT_API_KEY`: the tutor agent's bearer token for
  `GET /api/agent/sessions/:id` (context: kid's first name, grade, topic, signed note URLs, prior recaps),
  `POST /api/agent/sessions/:id/recap` (`{recap, practice:[{question,answer,hint?}]}`) and
  `POST /api/agent/sessions/:id/flag` (`{severity, note}`).
- Optional **frames relay** (`realtime/`): a small Node websocket service that receives Recall's realtime video
  frames + mixed audio and fans them out to the agent, in memory only. Deploy it anywhere with long‑lived processes
  (Fly.io/Render/Railway; a Dockerfile is included), set `FRAMES_WS_SECRET` and `AGENT_API_KEY` there, and put its public
  `wss://` URL in `NEXT_PUBLIC_FRAMES_WS_URL`. Without it, the bot simply isn't asked for frames.

Privacy guarantees are structural: no recording artifacts are requested, retention is set to the minimum, and
`delete_media` is called when the bot finishes.

---

## 6. Email and alerts

- **Resend:** `RESEND_API_KEY`, `EMAIL_FROM` (verify the domain in Resend). Emails: confirmation (with notes‑upload link),
  24h and 1h reminders, cancelled/refunded, rescheduled, recap ready, "trial already used", "slot taken, refunded".
- **Twilio:** `TWILIO_*` + `ALERT_PHONE_NUMBER` text *you* about fulfillment failures, medium/high safety flags, bot
  failures and disputes. Parents are never texted.

---

## 7. Deploy on Netlify

1. New site from this repo. Build command `npm run build`, publish directory `.next` (both in `netlify.toml`), Node 22.
   `@netlify/plugin-nextjs` is already a dev dependency and declared in `netlify.toml`.
2. Add every variable from `.env.example` in Site configuration → Environment variables.
   Set `NEXT_PUBLIC_SITE_URL` to the final domain and `CRON_SECRET` to a long random string.
3. The scheduled function `netlify/functions/cron-tick.mts` runs every 5 minutes (`*/5 * * * *`) and calls
   `POST /api/cron/tick` with `CRON_SECRET`: it expires stale holds, marks finished sessions, sends reminders and retries
   half‑finished fulfillment. Scheduled functions only run on published deploys; test one with "Run now" in the Netlify UI.
4. Point Stripe and Recall webhooks at the production domain (sections 3 and 5) and add the domain to Supabase's redirect URLs.

Netlify functions can't hold websockets, which is why the frames relay is a separate service.

---

## 8. Project layout

```
src/config.ts                  the one config file
src/app/(site)/                marketing, pricing, safety, legal, login, book, practice
src/app/(app)/                 dashboard, admin (signed-in)
src/app/api/                   slots, bookings, stripe, cron, recall, agent, livekit, admin, account
src/lib/booking/               service.ts (orchestration), repo.ts (DB port), index.ts (wiring)
src/lib/providers/             stripe, google, email, recall, sms — each behind a small interface
src/lib/slots.ts               business-hours slot engine (pure)
src/components/home/           hero, math card, motion sections
src/components/mascot/         the panther cub (SVG + CSS states)
supabase/migrations/           schema, RLS, book_slot() & friends, storage policies
netlify/functions/cron-tick    scheduled function
public/bridge.html             the page the tutor bot renders in the Meet
realtime/                      frames websocket relay (separate deploy)
tests/unit, tests/db, tests/e2e
```

## 9. Things to decide before launch

See `PLAN.md` §0. Short version: domain, business hours, final price, the Google Workspace account, the legal entity
name in Terms/Privacy, how you want to describe the tutor to parents, and (optionally) a real demo clip at
`public/demo/tutor-demo.mp3` for the home page player.
