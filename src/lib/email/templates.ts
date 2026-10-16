import { config, formatPrice } from "@/config";
import { formatWhen } from "@/lib/time";
import type { SessionRow } from "@/lib/db/types";

/**
 * Email templates. Plain functions returning subject/html/text so they can
 * be unit-tested and previewed without sending anything.
 */

export interface Mail {
  subject: string;
  html: string;
  text: string;
}

interface Ctx {
  session: SessionRow;
  parentName: string | null;
  childName: string | null;
  siteUrl: string;
}

const C = config.brand.colors;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, bodyHtml: string, siteUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:${C.paper};font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${C.ink};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.paper};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:2px solid ${C.ink};border-radius:24px;overflow:hidden;">
<tr><td style="background:${C.red};color:#fff;padding:20px 28px;font-weight:800;font-size:22px;letter-spacing:-0.02em;">${esc(config.brand.name)}</td></tr>
<tr><td style="padding:28px;font-size:17px;line-height:1.55;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px 24px;font-size:13px;color:${C.ink};opacity:.7;">Questions? Just reply to this email or write to <a href="mailto:${config.brand.supportEmail}" style="color:${C.red}">${config.brand.supportEmail}</a>.<br>${esc(config.brand.name)} · <a href="${siteUrl}/privacy" style="color:${C.red}">Privacy</a> · <a href="${siteUrl}/dashboard" style="color:${C.red}">Your dashboard</a></td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;background:${C.red};color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:999px;border:2px solid ${C.ink};">${esc(label)}</a></p>`;
}

function hi(name: string | null): string {
  return name ? `Hi ${esc(name.split(" ")[0])},` : "Hi there,";
}

function kindLabel(s: SessionRow): string {
  return s.kind === "trial" ? `free ${config.sessions.trialMinutes}-minute trial` : `${config.sessions.paidMinutes}-minute session`;
}

export function confirmationEmail(ctx: Ctx): Mail {
  const { session: s, siteUrl } = ctx;
  const when = formatWhen(s.starts_at, s.parent_timezone);
  const kid = ctx.childName ? esc(ctx.childName) : "your child";
  const notesUrl = `${siteUrl}/dashboard/s/${s.id}`;
  const tutor = config.brand.tutorLabel;
  const subject = `You're booked: ${kid}'s ${kindLabel(s)} on ${when}`;
  const html = layout(
    subject,
    `<p style="margin:0 0 12px;">${hi(ctx.parentName)}</p>
<p style="margin:0 0 12px;">${kid}'s ${kindLabel(s)} is confirmed.</p>
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0;background:${C.cream};border-radius:16px;width:100%;"><tr><td style="padding:16px 18px;">
<div style="font-weight:800;font-size:18px;">${esc(when)}</div>
${s.topic ? `<div style="margin-top:4px;">Topic: ${esc(s.topic)}</div>` : ""}
<div style="margin-top:8px;">Google Meet: <a href="${s.meet_url ?? "#"}" style="color:${C.red};font-weight:700;">${esc(s.meet_url ?? "link coming soon")}</a></div>
</td></tr></table>
<p style="margin:0 0 12px;"><strong>How it works:</strong> open the Meet link a minute or two before the start. ${esc(tutor)} will join the call, say hi to ${kid}, and work through the topic together. You're welcome to stay nearby — many parents do. Our note-taking assistant, ${esc(config.tutoring.assistantName)}, joins as well: it writes your recap and never records the call.</p>
<p style="margin:0 0 12px;"><strong>Have homework or notes?</strong> Upload a photo so the tutor can see exactly what ${kid} is working on.</p>
${button(notesUrl, "Upload notes or homework")}
<p style="margin:0;font-size:15px;">A calendar invite is on its way. Need to move it? You can reschedule or cancel for free up to ${config.sessions.freeCancelHours} hours before from your dashboard.</p>`,
    siteUrl,
  );
  const text = `${hi(ctx.parentName)}

${ctx.childName ?? "Your child"}'s ${kindLabel(s)} is confirmed.

When: ${when}${s.topic ? `\nTopic: ${s.topic}` : ""}
Google Meet: ${s.meet_url ?? "link coming soon"}

Open the Meet link a minute or two before the start. ${tutor} will join the call and work through the topic together. Our note-taking assistant, ${config.tutoring.assistantName}, joins as well — it writes your recap and never records the call.

Upload notes or homework: ${notesUrl}

Reschedule or cancel for free up to ${config.sessions.freeCancelHours} hours before: ${siteUrl}/dashboard`;
  return { subject, html, text };
}

export function reminderEmail(ctx: Ctx, hoursBefore: number): Mail {
  const { session: s, siteUrl } = ctx;
  const when = formatWhen(s.starts_at, s.parent_timezone);
  const kid = ctx.childName ? esc(ctx.childName) : "your child";
  const soon = hoursBefore <= 1;
  const subject = soon ? `Starting soon: ${kid}'s math session at ${when.split("·")[1]?.trim() ?? when}` : `Tomorrow: ${kid}'s math session · ${when}`;
  const html = layout(
    subject,
    `<p style="margin:0 0 12px;">${hi(ctx.parentName)}</p>
<p style="margin:0 0 12px;">${soon ? "Quick reminder — " : ""}${kid}'s ${kindLabel(s)} is ${soon ? "in about an hour" : "tomorrow"}: <strong>${esc(when)}</strong>.</p>
${button(s.meet_url ?? `${siteUrl}/dashboard`, "Open Google Meet")}
<p style="margin:0 0 12px;font-size:15px;">Tip: a quiet spot, a pencil and some paper make a big difference. ${soon ? "" : `Got homework to go over? <a href="${siteUrl}/dashboard/s/${s.id}" style="color:${C.red}">Upload a photo</a> before the session.`}</p>`,
    siteUrl,
  );
  const text = `${hi(ctx.parentName)}

${ctx.childName ?? "Your child"}'s ${kindLabel(s)} is ${soon ? "in about an hour" : "tomorrow"}: ${when}
Google Meet: ${s.meet_url ?? siteUrl + "/dashboard"}

Tip: a quiet spot, a pencil and some paper make a big difference.`;
  return { subject, html, text };
}

export function cancelledEmail(ctx: Ctx, refunded: boolean): Mail {
  const { session: s, siteUrl } = ctx;
  const when = formatWhen(s.starts_at, s.parent_timezone);
  const subject = `Cancelled: session on ${when}`;
  const refundLine = refunded
    ? `Your ${formatPrice(s.price_cents)} refund is on its way — it usually shows up on your card within 5–10 business days.`
    : s.kind === "paid"
      ? `Because this was cancelled inside the ${config.sessions.freeCancelHours}-hour window, this session isn't refundable. Reply to this email if something unexpected came up — we're happy to help.`
      : "";
  const html = layout(
    subject,
    `<p style="margin:0 0 12px;">${hi(ctx.parentName)}</p>
<p style="margin:0 0 12px;">The session on <strong>${esc(when)}</strong> is cancelled and removed from your calendar.</p>
${refundLine ? `<p style="margin:0 0 12px;">${esc(refundLine)}</p>` : ""}
${button(`${siteUrl}/book`, "Book another time")}`,
    siteUrl,
  );
  const text = `${hi(ctx.parentName)}

The session on ${when} is cancelled and removed from your calendar.
${refundLine ? `\n${refundLine}\n` : ""}
Book another time: ${siteUrl}/book`;
  return { subject, html, text };
}

export function rescheduledEmail(ctx: Ctx, previousStartsAt: string): Mail {
  const { session: s, siteUrl } = ctx;
  const when = formatWhen(s.starts_at, s.parent_timezone);
  const before = formatWhen(previousStartsAt, s.parent_timezone);
  const subject = `Moved: your session is now ${when}`;
  const html = layout(
    subject,
    `<p style="margin:0 0 12px;">${hi(ctx.parentName)}</p>
<p style="margin:0 0 12px;">Done — the session that was on ${esc(before)} is now <strong>${esc(when)}</strong>. The Google Meet link stays the same and your calendar invite is updated.</p>
${button(s.meet_url ?? `${siteUrl}/dashboard`, "Open Google Meet")}`,
    siteUrl,
  );
  const text = `${hi(ctx.parentName)}

The session that was on ${before} is now ${when}. The Google Meet link stays the same: ${s.meet_url ?? ""}`;
  return { subject, html, text };
}

export function trialAlreadyUsedEmail(ctx: Omit<Ctx, "session"> & { to: string }): Mail {
  const subject = "About your free trial booking";
  const html = layout(
    subject,
    `<p style="margin:0 0 12px;">${hi(ctx.parentName)}</p>
<p style="margin:0 0 12px;">Thanks for booking a free trial! It looks like your family has already used one, so we couldn't confirm a second. Nothing was charged.</p>
<p style="margin:0 0 12px;">You can book a regular ${config.sessions.paidMinutes}-minute session for ${formatPrice(config.pricing.paidSessionCents)} any time — same tutor, same Meet setup.</p>
${button(`${ctx.siteUrl}/book?kind=paid`, "Book a session")}
<p style="margin:0;font-size:15px;">Think this is a mistake? Just reply and we'll sort it out.</p>`,
    ctx.siteUrl,
  );
  const text = `${hi(ctx.parentName)}

Thanks for booking a free trial! It looks like your family has already used one, so we couldn't confirm a second. Nothing was charged.

Book a regular session: ${ctx.siteUrl}/book?kind=paid`;
  return { subject, html, text };
}

export function latePaymentRefundedEmail(ctx: Ctx): Mail {
  const { session: s, siteUrl } = ctx;
  const when = formatWhen(s.starts_at, s.parent_timezone);
  const subject = "That time was taken — you've been refunded";
  const html = layout(
    subject,
    `<p style="margin:0 0 12px;">${hi(ctx.parentName)}</p>
<p style="margin:0 0 12px;">Sorry about this one: the ${esc(when)} slot was booked by another family while your payment was going through. We've refunded ${formatPrice(s.price_cents)} in full.</p>
${button(`${siteUrl}/book`, "Pick another time")}`,
    siteUrl,
  );
  const text = `${hi(ctx.parentName)}

Sorry — the ${when} slot was booked by another family while your payment was going through. We've refunded ${formatPrice(s.price_cents)} in full.

Pick another time: ${siteUrl}/book`;
  return { subject, html, text };
}

export function recapReadyEmail(ctx: Ctx): Mail {
  const { session: s, siteUrl } = ctx;
  const kid = ctx.childName ? esc(ctx.childName) : "your child";
  const subject = `${kid}'s recap and practice problems are ready`;
  const html = layout(
    subject,
    `<p style="margin:0 0 12px;">${hi(ctx.parentName)}</p>
<p style="margin:0 0 12px;">Here's what ${kid} worked on today:</p>
<blockquote style="margin:0 0 16px;padding:14px 18px;background:${C.cream};border-radius:16px;">${esc(s.recap ?? "")}</blockquote>
${s.practice?.length ? `<p style="margin:0 0 12px;">${s.practice.length} practice problems are ready whenever ${kid} wants a quick win.</p>${button(`${siteUrl}/practice/${s.practice_token}`, "Open practice problems")}` : ""}`,
    siteUrl,
  );
  const text = `${hi(ctx.parentName)}

Here's what ${ctx.childName ?? "your child"} worked on today:

${s.recap ?? ""}
${s.practice?.length ? `\nPractice problems: ${siteUrl}/practice/${s.practice_token}` : ""}`;
  return { subject, html, text };
}
