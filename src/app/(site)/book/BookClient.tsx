"use client";

import { useSearchParams } from "next/navigation";
import BookWizard from "@/components/book/BookWizard";

export default function BookClient() {
  const params = useSearchParams();
  const kind = params.get("kind");
  return <BookWizard initialKind={kind === "trial" || kind === "paid" ? kind : null} cancelledId={params.get("cancelled")} />;
}
