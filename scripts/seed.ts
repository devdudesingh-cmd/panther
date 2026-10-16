/**
 * Seed a Supabase project with test data.
 *
 *   npm run db:seed            # reads .env.local (or .env)
 *   RESET=1 npm run db:seed    # wipes seeded rows first
 *
 * Creates two parent accounts (magic-link sign-in works for them), kids,
 * an upcoming confirmed session, a completed one with a recap and practice,
 * an abandoned hold, a block-out, a safety flag and a failed payment.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

for (const file of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { supabaseAdmin } = await import("../src/lib/supabase/admin");
const { config } = await import("../src/config");

const db = supabaseAdmin();

const SEED_EMAILS = ["parent.one@example.com", "parent.two@example.com"];

async function ensureParent(email: string, fullName: string) {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === email);
  let id = existing?.id;
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    id = data.user.id;
  }
  // The DB trigger creates the parents row; fill in the profile.
  const { error } = await db
    .from("parents")
    .upsert({ id, email, full_name: fullName, timezone: "America/Los_Angeles", adult_guardian_confirmed_at: new Date().toISOString() });
  if (error) throw error;
  return id;
}

function at(daysFromNow: number, hourLA: number): string {
  // A session start on a 10-minute mark at `hourLA` LA time, `daysFromNow` days out.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  const la = new Intl.DateTimeFormat("en-US", { timeZone: config.businessHours.timeZone, timeZoneName: "shortOffset", hour: "numeric" })
    .formatToParts(d)
    .find((p) => p.type === "timeZoneName")?.value; // e.g. "GMT-7"
  const offset = Number(la?.replace("GMT", "") || "-7");
  const utcHour = hourLA - offset;
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toISOString();
}

async function book(parentId: string, childId: string | null, kind: "trial" | "paid", startsAt: string, topic: string) {
  const minutes = kind === "trial" ? config.sessions.trialMinutes : config.sessions.paidMinutes;
  const { data, error } = await db.rpc("book_slot", {
    p_parent_id: parentId,
    p_child_id: childId,
    p_kind: kind,
    p_starts_at: startsAt,
    p_minutes: minutes,
    p_buffer_minutes: config.sessions.bufferMinutes,
    p_max_seats: config.sessions.maxSimultaneous,
    p_hold_minutes: config.sessions.holdMinutes,
    p_topic: topic,
    p_price_cents: kind === "trial" ? 0 : config.pricing.paidSessionCents,
    p_parent_timezone: "America/Los_Angeles",
  });
  if (error) throw error;
  return data;
}

async function main() {
  if (process.env.RESET) {
    console.log("Resetting seeded data…");
    const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
    for (const u of list?.users ?? []) {
      if (u.email && SEED_EMAILS.includes(u.email.toLowerCase())) {
        await db.auth.admin.deleteUser(u.id); // cascades to parents → children → sessions
      }
    }
    await db.from("blocked_times").delete().eq("reason", "seed: staff meeting");
    await db.from("trial_claims").delete().like("email_hash", "seed:%");
  }

  const p1 = await ensureParent(SEED_EMAILS[0], "Jordan Rivera");
  const p2 = await ensureParent(SEED_EMAILS[1], "Sam Okafor");

  const { data: kids, error: kidErr } = await db
    .from("children")
    .insert([
      { parent_id: p1, first_name: "Maya", grade: 3 },
      { parent_id: p2, first_name: "Leo", grade: 2 },
    ])
    .select();
  if (kidErr) throw kidErr;
  const maya = kids![0].id;
  const leo = kids![1].id;

  // Upcoming, confirmed paid session (2 days out, 4pm LA).
  const upcoming = await book(p1, maya, "paid", at(2, 16), "Fractions");
  await db
    .from("sessions")
    .update({
      status: "confirmed",
      hold_expires_at: null,
      paid_at: new Date().toISOString(),
      stripe_checkout_id: `cs_test_seed_${upcoming.id.slice(0, 8)}`,
      stripe_payment_intent: `pi_test_seed_${upcoming.id.slice(0, 8)}`,
      meet_url: "https://meet.google.com/abc-defg-hij",
      meet_space: "spaces/seed-space",
      calendar_event_id: "seed-event-1",
      recall_bot_id: "seed-bot-1",
      bot_status: "scheduled",
      fulfilled_at: new Date().toISOString(),
      confirmation_sent_at: new Date().toISOString(),
    })
    .eq("id", upcoming.id);

  // Completed trial last week with a recap + practice.
  const { data: past, error: pastErr } = await db
    .from("sessions")
    .insert({
      parent_id: p1,
      child_id: maya,
      kind: "trial",
      status: "completed",
      starts_at: at(-7, 16),
      ends_at: new Date(new Date(at(-7, 16)).getTime() + config.sessions.trialMinutes * 60_000).toISOString(),
      block_until: new Date(new Date(at(-7, 16)).getTime() + (config.sessions.trialMinutes + config.sessions.bufferMinutes) * 60_000).toISOString(),
      seat: 1,
      topic: "Multiplication tables",
      price_cents: 0,
      meet_url: "https://meet.google.com/old-link-xyz",
      recall_bot_id: "seed-bot-0",
      bot_status: "done",
      recap:
        "Maya worked on the 6s and 7s times tables. She's solid on 6×1 through 6×6 and used skip-counting to get 7×8. Next time: 7s above 7×6 and a few quick mixed drills.",
      practice: [
        { question: "6 × 7 = ?", answer: "42", hint: "Count by 6 seven times." },
        { question: "7 × 8 = ?", answer: "56", hint: "7 × 8 is 7 × 4 doubled." },
        { question: "9 × 6 = ?", answer: "54" },
      ],
      recap_ready_at: new Date().toISOString(),
      fulfilled_at: at(-8, 10),
    })
    .select()
    .single();
  if (pastErr) throw pastErr;
  await db.from("trial_claims").insert({ email_hash: `seed:${p1}`, parent_id: p1, session_id: past.id });

  // Second family: a trial coming up, 3 days out, 10am LA (weekend hours too).
  const trial = await book(p2, leo, "trial", at(3, 10), "Addition & subtraction");
  await db
    .from("sessions")
    .update({ status: "confirmed", hold_expires_at: null, meet_url: "https://meet.google.com/lmn-opqr-stu", fulfilled_at: new Date().toISOString() })
    .eq("id", trial.id);

  // An abandoned hold (expires in the past → shows the cron expiring it).
  const abandoned = await book(p2, leo, "paid", at(5, 17), "Word problems");
  await db.from("sessions").update({ hold_expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", abandoned.id);

  // Admin bits.
  await db.from("blocked_times").insert({ starts_at: at(4, 15), ends_at: at(4, 17), reason: "seed: staff meeting", created_by: p1 });
  await db.from("safety_flags").insert({
    session_id: past.id,
    severity: "low",
    note: "Child mentioned a sibling's full name; tutor steered back to math. No action needed.",
  });
  await db.from("payment_failures").insert({
    parent_id: p2,
    session_id: abandoned.id,
    stripe_object_id: "pi_test_seed_failed",
    reason: "card_declined",
  });

  console.log(`Seeded.
  Parents : ${SEED_EMAILS.join(", ")}  (sign in with a magic link)
  Upcoming: ${upcoming.id}
  Past    : ${past.id}  (practice token: ${past.practice_token})
  Trial   : ${trial.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
