# Panther — Build Plan

Live math tutoring for grades 2–4. A Panther tutor joins the family's Google Meet.
One free 25-minute trial per family, then paid 40-minute sessions ($19 default, in config).

---

## 0. Open items (need you)

| # | Item | Default I'll use until you say otherwise |
|---|------|------------------------------------------|
| 1 | Domain | `NEXT_PUBLIC_SITE_URL` env var; placeholder `https://panther.example` |
| 2 | Business hours (America/Los_Angeles) | Mon–Fri 3:00–8:00 pm, Sat–Sun 9:00 am–1:00 pm |
| 3 | Final price | $19 / 40-min session |
| 4 | Google Workspace account | Service account with domain-wide delegation, impersonating `GOOGLE_IMPERSONATE_USER` (e.g. `sessions@yourdomain`) |
| 5 | **`bridge.html` and `backend.ts` are not attached** (not in the repo, not in this session's upload folders) | I build the integration points (Recall bot scheduling, LiveKit token, frames websocket, agent routes, recap) against the providers' public APIs with clear seams; when you send the files I swap your logic in |
| 6 | Trial length: brief says 25 min (offer) and 20 min (slot rules) | **25 min** (what parents are promised); one config value `trialMinutes` |
| 7 | Awwwards: the network policy blocks awwwards.com, so I researched winners via secondary sources (see §5) | Enable the host and I'll screenshot references with Chromium before Phase 4 |
| 8 | **Who is the tutor?** The backend you describe (Recall bot + LiveKit + `/bridge` output page + recap logic) is an AI agent that joins the Meet. The brief also says "professional tutors / high schoolers". | Copy says "your Panther tutor" and never claims a human when none is there. The Safety page states plainly that an AI tutoring assistant joins the call and how it works — parents of 7–10-year-olds must know this (FTC, COPPA notice, CA bot-disclosure law). Tell me the real setup and I'll word it exactly. |

---

## 1. Architecture

```
Next.js 16 (App Router, TS, Tailwind v4)  ── Netlify (@netlify/plugin-nextjs + scheduled function)
 ├─ Marketing pages (RSC, static)           GSAP 3.15 (ScrollTrigger, SplitText — free since 3.13) + Lenis,
 │                                          dynamically imported after hydration
 ├─ /book (client wizard)                   ── /api/slots, /api/bookings
 ├─ /dashboard (parent, Supabase auth)      ── Supabase Storage (private notes bucket, RLS)
 ├─ /admin (ADMIN_EMAILS only)
 ├─ /bridge  → public/bridge.html           (Recall output-media page: bot camera renders this)
 └─ /api/*
      stripe/webhook   ── confirm / refund / fail (idempotent via stripe_events)
      recall/webhook   ── bot status; delete bot media after call
      agent/*          ── session context, recap, safety flags (AGENT_API_KEY)
      livekit/token
      cron/tick        ── Netlify scheduled fn every 5 min: expire holds, reminders, retry fulfillment
realtime/ (separate small Node service, Fly/Render)  ── frames websocket (Netlify functions can't hold a WS);
                                                         frames processed in memory, never stored
```

Libraries: `@supabase/ssr`, `stripe`, `resend`, `google-auth-library` (Meet REST + Calendar via fetch),
`livekit-server-sdk`, `luxon` (time zones), `zod`, `gsap`, `lenis`. Twilio is called over REST (no SDK).
Analytics: optional Plausible via env var. No cookies for tracking, no ads, no session replay.

---

## 2. Data model (Supabase Postgres, RLS on every table)

| Table | Key columns | Notes |
|-------|-------------|-------|
| `parents` | `id` (= auth.users.id), email, full_name, phone, timezone, `adult_guardian_confirmed_at` | Parents read/update only their own row |
| `children` | id, parent_id, first_name, grade (2–4) | **No** last name, email or photo. Deleted on request |
| `sessions` | id, parent_id, child_id, kind (`trial`/`paid`), status (`held`→`confirmed`→`completed`, or `cancelled`/`expired`), starts_at, ends_at, **seat** (1..max), hold_expires_at, topic, price_cents, stripe_checkout_id, stripe_payment_intent, refund_id, meet_space, meet_url, calendar_event_id, recall_bot_id, bot_status, recap, practice (jsonb), practice_token, reminder_24h_at, reminder_1h_at | Parent reads own rows; all writes go through server routes |
| `consents` | parent_id, session_id, policy_version, consented_at, ip_hash | Append-only consent record |
| `trial_claims` | email_hash (unique), card_fingerprint (unique), parent_id, session_id | Hashes only, so they **survive data deletion** and still block repeat trials |
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

**One free trial per family — three independent locks, all checked again in the webhook:**
1. **Verified email**, normalized (lowercase, Gmail dots and `+tags` stripped) then hashed → unique in `trial_claims`.
2. **Card fingerprint**: a card is required to *reserve* the trial (Stripe Checkout `mode: setup`, **$0 charged**);
   the resulting `payment_method.card.fingerprint` is unique in `trial_claims`. Same card, new email → blocked.
3. **One trial per parent account** (`sessions` partial unique index on `parent_id where kind='trial'`).
If any lock is already taken, the hold is released and the parent gets a friendly email offering a paid session.
Claims are kept even when the trial is cancelled; a parent who cancels >24 h ahead can rebook the trial once
(claim points at the new session), but never a second trial. Claims survive "delete my child's data".

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
     create Meet space (`accessType: OPEN`) → fall back to Calendar `conferenceData` → calendar invite to parent →
     confirmation email (notes-upload link, "your tutor will join your Meet") → schedule Recall bot
     (`join_at` = start − 2 min, always >10 min ahead so it's a guaranteed *scheduled* bot) → save all.
     Each step is skipped if already done, so retries are safe; the cron retries any partial fulfillment.
   - Payment arrives after the hold expired → re-hold the same slot if still free, otherwise refund
     automatically and email the parent.
   - `checkout.session.expired` → release the hold. The cron also expires abandoned Checkout sessions.
8. Reminders at 24 h and 1 h (cron, idempotent via timestamp columns).
9. Cancel/reschedule: free until 24 h before; refund issued automatically; bot cancelled (Delete Scheduled Bot,
   or Leave Call if <10 min out); event deleted or updated. Inside 24 h: cancel without refund, no reschedule.

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

## 5. Design direction (what wins on Awwwards, made ours)

What the jury actually scores — from an Awwwards juror's 2026 breakdown and the GSAP-built winners
(By-Kin, Mat Voyce, Uncommon Studio, Obys): **(1) art direction with one point of view, (2) choreographed
motion that carries meaning, (3) 60 fps on a mid-range phone, plus a real reduced-motion path.** Winners
aren't decorated templates; the static frame already looks like a poster. Kinetic type is the signature move
of the current crop; playful character-led sites (Resn, UI KIDS) are the kids-space reference.

- **Feel:** warm paper-white (`#FFF8F2`), Panther red (`#D6111E`, 5.3:1 on white), ink (`#1B0E0E`), one blush
  tint. Red is the hero color; whitespace does the rest. Big rounded "chalk sticker" shapes, not gradients.
- **Type:** Bricolage Grotesque (huge, expressive display, variable width axis) + Figtree (friendly body),
  self-hosted with `next/font` (zero layout shift).
- **Mascot:** original SVG panther cub with a red headset. Eyes, ears and tail are separate parts so it can
  blink, follow the cursor and cheer. Pure CSS/SVG — no Lottie, no WebGL — so it's instant on phones.
- **Hero:** giant SplitText headline (chars, masked reveal). The cub holds a puzzle card ("8 + 7 = ?") with tappable
  number tiles and keyboard input. A correct answer fires a confetti burst, the cub cheers and a new grade-2–4
  problem appears. Hero is plain CSS first so LCP paints before GSAP loads.
- **Scroll:** Lenis smooth scroll synced to GSAP ticker; topic marquee; pinned "How it works" with a scrubbed SVG
  path drawing through 4 steps; stacked cards for "What's different"; waveform demo player with captions;
  pricing numbers that count up; full-bleed red CTA with oversized kinetic type.
- **Guardrails:** `prefers-reduced-motion` disables all motion (content still fully visible). GSAP dynamically
  imported. Target Lighthouse mobile ≥ 90, WCAG AA, visible focus rings, 44 px tap targets.

---

## 6. Build phases (each is tested before the next starts)

| Phase | Scope | Tests |
|-------|-------|-------|
| 1 | Scaffold, `config.ts`, design tokens, lint/typecheck, Netlify config | build passes |
| 2 | DB migration, RLS, `book_slot()`, seed script | Vitest + PGlite: double-booking race, capacity 3, buffer, holds expire, trial uniqueness, RLS isolation |
| 3 | Slot engine, booking API, Stripe Checkout + webhook, trial guard, fulfillment (Meet/Calendar/Resend/Recall), cancel/refund, reminders cron | unit tests with mocked providers: idempotent replay, late payment, refund rules, DST |
| 4 | Marketing site + mascot + GSAP motion, content pages | Playwright smoke, axe accessibility, Lighthouse mobile |
| 5 | Book wizard UI, auth, parent dashboard (uploads, reschedule, cancel, recaps, delete data) | Playwright with mocked API |
| 6 | Admin, agent routes, LiveKit, `/bridge`, realtime frames service | route auth tests |
| 7 | `.env.example`, README (setup + deploy), `TEST_CHECKLIST.md` | full test run |
