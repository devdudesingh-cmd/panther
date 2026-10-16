# Panther — Build Plan

Live math tutoring for grades 2–4. Ari, an AI tutor, joins the family's Google Meet.
1 free 25-min trial per family, then paid 40-min sessions ($19 default, in config).

---

## 0. Open items (need you)

| # | Item | Default I'll use until you say otherwise |
|---|------|------------------------------------------|
| 1 | Domain | `NEXT_PUBLIC_SITE_URL` env var; placeholder `https://panther.example` |
| 2 | Business hours (America/Los_Angeles) | Mon–Fri 3:00–8:00 pm, Sat–Sun 9:00 am–1:00 pm |
| 3 | Final price | $19 / 40-min session |
| 4 | Google Workspace account | Service account with domain-wide delegation, impersonating `GOOGLE_IMPERSONATE_USER` (e.g. `sessions@yourdomain`) |
| 5 | **`bridge.html` and `backend.ts` were not attached**: they aren't in the repo or this session | I build the integration points (Recall bot, LiveKit token, frames WS, agent routes, recap) to their public API contracts, then swap in your code when you send it |
| 6 | Trial length: brief says 25 min (offer) and 20 min (booking rules) | **25 min** (what parents are promised); one config value |
| 7 | Awwwards research: the network policy blocks awwwards.com | Enable access and I'll browse it with Chromium and capture references before Phase 4 |

---

## 1. Architecture

```
Next.js 16 (App Router, TS, Tailwind v4)  ── Netlify (functions + scheduled functions)
 ├─ Marketing pages (RSC, static)           GSAP + ScrollTrigger + Lenis, loaded after hydration
 ├─ /book (client wizard)                   ── /api/slots, /api/bookings
 ├─ /dashboard (parent, Supabase auth)      ── Supabase Storage (private notes bucket, RLS)
 ├─ /admin (ADMIN_EMAILS only)
 ├─ /bridge  → public/bridge.html           (Recall output-media page)
 └─ /api/*
      stripe/webhook   ── confirm / refund / fail (idempotent)
      recall/webhook   ── bot status, delete media after call
      agent/*          ── session context, recap, safety flags (AGENT_API_KEY)
      livekit/token
      cron/tick        ── Netlify scheduled fn every 5 min: expire holds, reminders, retry fulfillment
realtime/ (separate small Node service, Fly/Render)  ── frames websocket (Netlify can't hold WS);
                                                         frames are processed in memory, never stored
```

Libraries: `@supabase/ssr`, `stripe`, `resend`, `google-auth-library` (Meet REST + Calendar via fetch),
`livekit-server-sdk`, `luxon` (time zones), `zod`, `gsap`, `lenis`. Twilio is called over REST (no SDK).
Analytics: optional Plausible via env var. No cookies, ads or session replay.

---

## 2. Data model (Supabase Postgres, RLS on every table)

| Table | Key columns | Notes |
|-------|-------------|-------|
| `parents` | `id` (= auth.users.id), email, full_name, phone, timezone, `adult_guardian_confirmed_at` | Parents can read and update only their own row |
| `children` | id, parent_id, first_name, grade (2–4) | **No** last name, email or photo. Deleted on request |
| `sessions` | id, parent_id, child_id, kind (`trial`/`paid`), status (`held`→`confirmed`→`completed`, or `cancelled`/`expired`), starts_at, ends_at, **seat** (1..max), hold_expires_at, topic, price_cents, stripe_checkout_id, stripe_payment_intent, refund_id, meet_space, meet_url, calendar_event_id, recall_bot_id, bot_status, recap, practice (jsonb), practice_token, reminder_24h_at, reminder_1h_at | Parent reads own rows; all writes go through server routes |
| `consents` | parent_id, session_id, policy_version, consented_at, ip_hash | Append-only consent record |
| `trial_claims` | email_hash (unique), card_fingerprint (unique), parent_id, session_id | Hashes only, so they **survive data deletion** and block repeat trials |
| `blocked_times` | starts_at, ends_at, reason | Admin block-outs |
| `stripe_events` | event_id PK, type, processed_at | Webhook idempotency |
| `payment_failures` | parent_id, session_id, reason | Admin view |
| `safety_flags` | session_id, severity, note, resolved_at | Raised by the agent; texts you via Twilio |
| `app_settings` | bookings_paused | Admin toggle |

**Double-booking guarantee:** `EXCLUDE USING gist (seat WITH =, tstzrange(starts_at, ends_at + buffer) WITH &&)`
on active rows (an exclusion constraint is the range version of a unique constraint). A `book_slot()` SQL
function expires stale holds, checks block-outs, then tries seats 1..max in one transaction. The database
can never hold more than `maxSimultaneous` overlapping sessions, even under race conditions. A second
constraint stops one parent from holding two overlapping sessions.

**One free trial per family:** (1) verified email (Supabase OTP / magic link), normalized
(lowercase, Gmail dots and `+tags` stripped) then hashed, unique; (2) a card is required to *reserve* the
trial (Stripe Checkout in `setup` mode, **$0 charged**), and its `card.fingerprint` is unique in
`trial_claims`; (3) one trial per parent account. The check runs again in the webhook before confirming.
If the card or email was already used, the hold is released and the parent gets a friendly email offering
a paid session. Claims are released only when a trial is cancelled more than 24 h ahead.

---

## 3. Booking flow

1. `/book`: choose **Free trial** or **40-min session**
2. Calendar of open slots shown in the parent's time zone (business hours are defined in LA time)
3. Parent details: email → 6-digit code (Supabase OTP; works on phones without leaving the page), name,
   phone (optional), 18+ / guardian checkbox
4. Kid: first name, grade, topic
5. Required consent checkbox (stored with timestamp and policy version)
6. `POST /api/bookings` → `book_slot()` 10-min hold → Stripe Checkout (`payment`, or `setup` for the trial)
7. Success page **only polls**; confirmation happens in the Stripe webhook:
   - `checkout.session.completed` → claim trial (if trial) → mark confirmed → **fulfill**:
     create Meet space (open access) → fall back to Calendar `conferenceData` → calendar invite to parent →
     confirmation email (notes-upload link, "Ari will join your Meet") → schedule Recall bot → save all.
     Each step is skipped if already done, so retries are safe; the cron retries any partial fulfillment.
   - Payment arrives after the hold expired → re-hold the same slot if still free, otherwise refund
     automatically and email the parent.
   - `checkout.session.expired` → release the hold. The cron also expires abandoned Checkout sessions.
8. Reminders at 24 h and 1 h (cron, idempotent via timestamp columns).
9. Cancel/reschedule: free until 24 h before; refund issued automatically; bot cancelled; event deleted
   or updated. Inside 24 h: cancel without refund, no reschedule.

---

## 4. Routes

**Pages:** `/`, `/book`, `/book/done`, `/login`, `/auth/callback`, `/dashboard`, `/dashboard/s/[id]`,
`/practice/[token]`, `/pricing`, `/safety`, `/terms`, `/privacy`, `/parent-notice`, `/admin`, `/bridge`

**API:** `GET /api/slots` · `POST /api/bookings` · `GET /api/bookings/[id]` · `POST /api/bookings/[id]/cancel` ·
`POST /api/bookings/[id]/reschedule` · `POST /api/account/delete-child` · `POST /api/stripe/webhook` ·
`POST /api/recall/webhook` · `POST /api/livekit/token` · `GET /api/agent/sessions/[id]` ·
`POST /api/agent/sessions/[id]/recap` · `POST /api/agent/sessions/[id]/flag` · `GET /api/cron/tick` ·
`POST|DELETE /api/admin/blocks` · `POST /api/admin/flags/[id]` · `POST /api/admin/settings`

---

## 5. Design direction

- **Feel:** warm paper-white (`#FFF8F2`), Panther red (`#D6111E`, 5.3:1 on white), ink (`#1B0E0E`), and one
  blush tint. Red is the hero color; whitespace does the rest.
- **Type:** Bricolage Grotesque (huge, expressive display) + Figtree (friendly body), self-hosted with
  `next/font` (no layout shift).
- **Ari:** original SVG panther cub with a red headset. Eyes, ears and tail are separate parts so Ari can
  blink, follow the cursor and cheer.
- **Hero:** giant split-text headline. Ari holds a puzzle card ("8 + 7 = ?") with tappable number tiles
  and keyboard input. A correct answer sets off a confetti burst, Ari cheers and a new grade-2–4 problem
  appears.
- **Scroll:** Lenis smooth scroll; topic marquee; pinned "How it works" with a scrubbed path that draws
  through 4 steps; stacked cards for "What's different"; a waveform demo player with live captions;
  pricing that counts up; full-bleed red CTA with oversized type.
- **Guardrails:** `prefers-reduced-motion` turns off all motion. The LCP hero is plain CSS so it paints before
  JS loads. GSAP is dynamically imported. Target Lighthouse mobile ≥ 90, AA contrast, visible focus rings.

---

## 6. Build phases (each is tested before the next starts)

| Phase | Scope | Tests |
|-------|-------|-------|
| 1 | Scaffold, `config.ts`, design tokens, lint/typecheck, Netlify config | build passes |
| 2 | DB migration, RLS, `book_slot()`, seed script | Vitest + PGlite: double-booking race, capacity 3, buffer, holds expire, trial uniqueness, RLS isolation |
| 3 | Slot engine, booking API, Stripe Checkout + webhook, trial guard, fulfillment (Meet/Calendar/Resend/Recall), cancel/refund, reminders cron | unit tests with mocked providers: idempotent replay, late payment, refund rules, DST |
| 4 | Marketing site + Ari + GSAP motion, content pages | Playwright smoke, axe accessibility, Lighthouse mobile |
| 5 | Book wizard UI, auth, parent dashboard (uploads, reschedule, cancel, recaps, delete data) | Playwright with mocked API |
| 6 | Admin, agent routes, LiveKit, `/bridge`, realtime frames service | route auth tests |
| 7 | `.env.example`, README (setup + deploy), `TEST_CHECKLIST.md` | full test run |
