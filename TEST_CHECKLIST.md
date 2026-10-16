# Panther — test checklist

Automated coverage runs with `npm run check` (lint, typecheck, unit + DB tests, build) and `npm run test:e2e`
(Playwright, mocked APIs). This checklist is the **manual pass against real services** (Supabase + Stripe test mode +
Google + Recall) before going live. Tick each box.

Setup: `.env.local` filled in, migrations applied, `npm run db:seed`, `stripe listen --forward-to localhost:3000/api/stripe/webhook`,
site running (`npm run dev`), Netlify "Run now" available for the cron (or call `POST /api/cron/tick` with the bearer secret).

## 1. Book a free trial
- [ ] `/book` → Free trial → calendar shows only LA business hours, converted to my time zone; slots step by 10 min
- [ ] Enter email → 6‑digit code arrives → code works without leaving the page; the link in the same email also works
- [ ] Name, phone, 18+/guardian checkbox required; kid step accepts only first name + grade 2–4 + topic
- [ ] Consent checkbox required; review shows "$0 — card on file, nothing charged"
- [ ] "Reserve my free trial" → Stripe Checkout in **setup** mode (no amount) → card `4242 4242 4242 4242`
- [ ] `/book/done` shows "Confirming…" then flips to "See you on the Meet!" with a `meet.google.com` link
- [ ] DB: `sessions.status = confirmed`, `trial_claims` has one row with 64‑char `email_hash`, `card_fingerprint`, `phone_hash`
- [ ] Email: confirmation with the correct local time, Meet link, "your Panther tutor will join", notes‑upload link
- [ ] Calendar: invite received; event has the Meet link
- [ ] Recall dashboard: bot scheduled, `join_at` = start − 2 min, output media URL = `/bridge?session=…&t=…`

## 2. Book a paid session
- [ ] `/book?kind=paid` → Checkout shows **$19** (or the configured price) in **payment** mode
- [ ] Pay with `4242…` → confirmed via webhook (watch `stripe listen` output) → same fulfillment as above
- [ ] `sessions.paid_at` and `stripe_payment_intent` set; dashboard shows the session under Upcoming
- [ ] Refresh `/book/done` repeatedly: nothing changes on the server (it only polls)

## 3. Stripe test cards and edge cases
- [ ] Declined card `4000 0000 0000 0002` → Checkout shows the decline; `payment_failures` gets a row; slot still held until the hold expires
- [ ] 3‑D Secure card `4000 0025 0000 3155` → complete the challenge → confirmed normally
- [ ] Abandon Checkout and wait 10 min (or run the cron) → `status = expired`, slot reappears in the calendar
- [ ] Replay the `checkout.session.completed` event from the Stripe dashboard → second delivery is a no‑op (`duplicate: true`), no second email/bot
- [ ] Late payment: set a held session to `expired` in the DB, then complete its Checkout → it's revived and confirmed; fill the time first → it's refunded automatically and the parent gets the "refunded" email

## 4. One free trial per family
- [ ] Same account books a second trial → refused before Stripe ("already used its free trial")
- [ ] New account with `first.last+kid@gmail.com` when `firstlast@gmail.com` already claimed → refused before Stripe
- [ ] New account, new email, **same card** → Checkout completes, webhook cancels it, parent gets the "about your free trial" email, no bot scheduled
- [ ] New account, new email, same phone number → refused before Stripe
- [ ] Cancel a confirmed trial → still can't book another trial; booking a paid session works
- [ ] Delete the child's data → `trial_claims` row remains

## 5. Double‑booking attempt
- [ ] Open the same slot in 4 browsers (capacity 3) and submit within the hold window → exactly 3 holds succeed, the 4th gets "That time was just taken"
- [ ] With one seat free, try to book 45 min after an existing session's start (inside the 10‑min buffer) → slot not offered; 50 min after → offered
- [ ] Direct SQL insert of an overlapping confirmed session on the same seat → `sessions_seat_no_overlap` violation
- [ ] Same parent, overlapping time → "You already have a session at that time"

## 6. Cancel and refund
- [ ] Paid session > 24h out → Cancel → dialog says the refund is automatic → `stripe_refund_id` set, refund visible in Stripe, bot deleted in Recall, calendar event removed, "cancelled + refund" email
- [ ] Paid session < 24h out → Cancel works but no refund; dialog and email say so; Reschedule button disabled
- [ ] Reschedule > 24h out → new time saved, calendar event moved, old bot deleted + new bot scheduled, "Moved" email; reminders reset
- [ ] Admin cancel from `/admin` inside 24h → refunded anyway
- [ ] Another parent's session id in `POST /api/bookings/<id>/cancel` → 403

## 7. Bot gets scheduled (and shows up)
- [ ] Confirm a session ≥ 15 min out; in Recall the bot is **scheduled** (not ad‑hoc) and its metadata has `session_id`
- [ ] Open the Meet a minute early → bot joins at start − 2 min, camera shows the Panther avatar from `/bridge`, name = `RECALL_BOT_NAME`
- [ ] Agent connects to the LiveKit room → avatar's mouth moves with the voice, captions appear
- [ ] `/api/recall/webhook` receives `joining_call → in_call_… → done`; `/admin` bot column updates; `delete_media` called on `done`
- [ ] Bot not updated when `join_at` is < 10 min away (reschedule path deletes + recreates instead)
- [ ] `GET /api/agent/sessions/:id` without the key → 401; with it → context incl. signed note URLs and prior recaps
- [ ] `POST …/recap` → recap + practice saved, "recap ready" email once; `/practice/<token>` works without login
- [ ] `POST …/flag` severity high → row in `safety_flags`, SMS received, shows in `/admin`, resolve works

## 8. Reminder emails
- [ ] Session 23.5h away → cron → "Tomorrow" email once (`reminder_24h_sent_at` set); run cron again → no duplicate
- [ ] Session 50 min away → cron → "Starting soon" email once
- [ ] Session booked with < 3h lead → only the 1h reminder, never the 24h one
- [ ] Session ended → cron marks it `completed`; it moves to Past on the dashboard

## 9. Data deletion
- [ ] Dashboard → "Delete <name>'s data" → child gone, their sessions show "Your child", `recap`/`practice`/`topic` null, uploaded files gone from Storage and `session_files`
- [ ] Upcoming session for that child still happens (status unchanged, Meet link intact)
- [ ] `trial_claims` and `consents` remain (hashes/consent record only)
- [ ] Another parent's `childId` in `POST /api/account/delete-child` → 404

## 10. Uploads, privacy and access
- [ ] Upload a JPG/PDF on a session → appears in the list, opens via signed URL; delete works
- [ ] Try to read another parent's file path with the browser client → denied by Storage RLS
- [ ] Signed‑out `/dashboard` and `/admin` → `/login?next=…`; non‑admin on `/admin` → `/dashboard`
- [ ] Page source: no third‑party trackers; only Supabase auth cookies; Plausible only if `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` is set

## 11. Quality bar
- [ ] Lighthouse (mobile, production build): Performance ≥ 90, Accessibility ≥ 95, CLS < 0.1 on `/`, `/book`, `/pricing`
- [ ] axe clean on every page (`npm run test:e2e` asserts this)
- [ ] Keyboard only: skip link, header nav, math card, wizard, dialogs (focus stays inside, Esc/close works)
- [ ] `prefers-reduced-motion`: no movement anywhere, all content visible
- [ ] 320px wide: no horizontal scroll on any page
