"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SessionFileRow } from "@/lib/db/types";

const ACCEPT = "image/jpeg,image/png,image/heic,image/webp,application/pdf";
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Notes/homework uploads. Files go straight from the browser to the private
 * "notes" bucket at <parent_id>/<session_id>/<file>; storage RLS and the
 * session_files policy make them private to this parent.
 */
export default function Uploads({ sessionId, parentId, files, locked }: { sessionId: string; parentId: string; files: SessionFileRow[]; locked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setBusy(true);
    const supabase = supabaseBrowser();
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) {
        setError(`${file.name} is over 15 MB.`);
        continue;
      }
      const safeName = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${parentId}/${sessionId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("notes").upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (upErr) {
        setError(`Couldn't upload ${file.name}: ${upErr.message}`);
        continue;
      }
      const { error: rowErr } = await supabase
        .from("session_files")
        .insert({ session_id: sessionId, parent_id: parentId, storage_path: path, file_name: file.name, content_type: file.type || null, size_bytes: file.size });
      if (rowErr) {
        await supabase.storage.from("notes").remove([path]);
        setError(`Couldn't save ${file.name}. Please try again.`);
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function view(f: SessionFileRow) {
    if (urls[f.id]) {
      window.open(urls[f.id], "_blank", "noopener");
      return;
    }
    const { data, error } = await supabaseBrowser().storage.from("notes").createSignedUrl(f.storage_path, 300);
    if (error || !data) {
      setError("Couldn't open that file right now.");
      return;
    }
    setUrls((u) => ({ ...u, [f.id]: data.signedUrl }));
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function remove(f: SessionFileRow) {
    setError(null);
    const supabase = supabaseBrowser();
    await supabase.storage.from("notes").remove([f.storage_path]);
    const { error } = await supabase.from("session_files").delete().eq("id", f.id);
    if (error) setError("Couldn't delete that file.");
    router.refresh();
  }

  return (
    <div>
      {!locked ? (
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-ink bg-white p-6 text-center transition-colors hover:bg-cream ${busy ? "opacity-60" : ""}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            upload(e.dataTransfer.files);
          }}
        >
          <span className="display text-lg font-extrabold">{busy ? "Uploading…" : "Add a photo or PDF"}</span>
          <span className="text-sm text-ink-soft">Worksheet, textbook page, or a note about what&apos;s tricky. Up to 15 MB each.</span>
          <input ref={inputRef} type="file" className="sr-only" accept={ACCEPT} multiple onChange={(e) => upload(e.target.files)} disabled={busy} />
        </label>
      ) : (
        <p className="text-sm text-ink-soft">Uploads are closed for this session.</p>
      )}
      {error ? (
        <p className="mt-3 rounded-xl bg-blush px-4 py-3 text-sm font-semibold text-red-deep" role="alert">
          {error}
        </p>
      ) : null}
      {files.length ? (
        <ul className="mt-4 divide-y divide-line rounded-2xl border-2 border-ink bg-white">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <button type="button" onClick={() => view(f)} className="min-w-0 truncate text-left font-semibold text-red underline-offset-4 hover:underline">
                {f.file_name}
              </button>
              <span className="shrink-0 text-xs text-ink-soft">{f.size_bytes ? `${Math.max(1, Math.round(f.size_bytes / 1024))} KB` : ""}</span>
              {!locked ? (
                <button type="button" onClick={() => remove(f)} className="btn btn-quiet min-h-9 shrink-0 px-3 text-sm" aria-label={`Delete ${f.file_name}`}>
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">No uploads yet.</p>
      )}
      <p className="mt-3 text-xs text-ink-soft">Please avoid photos that show your child&apos;s face or full name. Files are private to your account.</p>
    </div>
  );
}
