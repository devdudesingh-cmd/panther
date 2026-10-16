import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PracticeItem } from "@/lib/db/types";
import PracticeList from "./PracticeList";

export const metadata: Metadata = { title: "Practice problems", robots: { index: false } };

/**
 * /practice/[token] — kid-friendly practice page. The token is an unguessable
 * 128-bit id, so the page works from the recap email without a login and
 * never shows anything but the problems and the first name.
 */
export default function PracticePage({ params }: PageProps<"/practice/[token]">) {
  return (
    <main id="main" className="wrap flex-1 py-12 md:py-16">
      <Suspense fallback={<p className="text-ink-soft">Loading…</p>}>
        <Practice params={params} />
      </Suspense>
    </main>
  );
}

async function Practice({ params }: { params: PageProps<"/practice/[token]">["params"] }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const db = supabaseAdmin();
  const { data: s } = await db.from("sessions").select("id, practice, topic, child_id").eq("practice_token", token).maybeSingle();
  if (!s?.practice?.length) notFound();
  const { data: child } = s.child_id ? await db.from("children").select("first_name").eq("id", s.child_id).maybeSingle() : { data: null };
  const items = s.practice as PracticeItem[];
  return (
    <div className="mx-auto max-w-2xl">
      <p className="eyebrow">Practice time</p>
      <h1 className="text-display-md mt-3">{child?.first_name ? `${child.first_name}, you've got this.` : "You've got this."}</h1>
      <p className="mt-3 text-lg text-ink-soft">
        {items.length} quick problems{s.topic ? ` on ${s.topic.toLowerCase()}` : ""}. Type an answer, check it, and watch the streak grow.
      </p>
      <div className="mt-8">
        <PracticeList items={items} />
      </div>
    </div>
  );
}
