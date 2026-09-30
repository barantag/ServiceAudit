import Link from "next/link";
import { REVIEW_STATUS_LABELS, type ReviewStatus } from "@/lib/findings/review-contract";

export function ReviewState({ status }: { status: ReviewStatus }) {
  const color = status === "confirmed" ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "dismissed" ? "border-slate-200 bg-slate-100 text-slate-700"
    : "border-amber-200 bg-amber-50 text-amber-800";
  return <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${color}`}>{REVIEW_STATUS_LABELS[status]}</span>;
}

export function FindingReviewAction({ findingKey, status }: { findingKey: string; status: ReviewStatus | null }) {
  return (
    <td className="min-w-40 px-4 py-4">
      {status ? <ReviewState status={status} /> : <p className="text-sm text-red-700">Durum yüklenemedi</p>}
      <Link prefetch={false} href={`/findings/detail?key=${encodeURIComponent(findingKey)}`}
        className="mt-3 block w-fit rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100">
        İncele
      </Link>
    </td>
  );
}
