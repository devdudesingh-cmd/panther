import Link from "next/link";
import { DateTime } from "luxon";
import { config } from "@/config";
import type { ChildRow, SessionRow } from "@/lib/db/types";
import CancelButton from "./CancelButton";
import RescheduleDialog from "./RescheduleDialog";

export default function SessionCard({ session: s, child, tz, now }: { session: SessionRow; child: ChildRow | null; tz: string; now: number }) {
  const start = DateTime.fromISO(s.starts_at).setZone(tz);
  const hours = (Date.parse(s.starts_at) - now) / 3_600_000;
  const canChange = s.status === "confirmed" && hours >= config.sessions.freeCancelHours;
  const soon = hours < 1 && hours > -1;

  return (
    <li className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${s.kind === "trial" ? "bg-mint" : "bg-cream"}`}>
            {s.kind === "trial" ? `Free ${config.sessions.trialMinutes}-min trial` : `${config.sessions.paidMinutes}-min session`}
          </span>
          {s.status === "held" ? <span className="rounded-full bg-sun px-2.5 py-0.5 text-xs font-bold">Awaiting payment</span> : null}
          {soon ? <span className="rounded-full bg-red px-2.5 py-0.5 text-xs font-bold text-white">Starting soon</span> : null}
        </div>
        <h3 className="display mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">
          {start.toFormat("cccc, LLLL d")} · {start.toFormat("h:mm a ZZZZ")}
        </h3>
        <p className="mt-1 text-ink-soft">
          {child ? `${child.first_name}, grade ${child.grade}` : "Your child"}
          {s.topic ? ` · ${s.topic}` : ""}
        </p>
        {s.meet_url ? (
          <a href={s.meet_url} className="mt-3 inline-flex items-center gap-2 font-semibold text-red underline-offset-4 hover:underline" target="_blank" rel="noopener">
            <span aria-hidden="true">▶</span> Open Google Meet
          </a>
        ) : s.status === "confirmed" ? (
          <p className="mt-3 text-sm text-ink-soft">Meet link is being created — check back in a minute.</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
        <Link href={`/dashboard/s/${s.id}`} className="btn btn-primary min-h-11 text-[15px]">
          Upload notes
        </Link>
        {s.status === "confirmed" ? (
          <>
            <RescheduleDialog sessionId={s.id} kind={s.kind} tz={tz} disabled={!canChange} />
            <CancelButton sessionId={s.id} refundable={s.kind === "paid" && canChange} tooLate={!canChange} />
          </>
        ) : null}
      </div>
    </li>
  );
}
