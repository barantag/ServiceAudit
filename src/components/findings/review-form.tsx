"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_REVIEW, isReviewStatus, isReviewResponse, MAX_REVIEW_NOTE_LENGTH, REVIEW_STATUS_LABELS, type FindingReview } from "@/lib/findings/review-contract";
import { ReviewState } from "./review-state";

export function ReviewForm({ findingKey, initialReview = DEFAULT_REVIEW }: { findingKey: string; initialReview?: FindingReview }) {
  const router = useRouter();
  const [savedReview, setSavedReview] = useState(initialReview);
  const [status, setStatus] = useState(initialReview.status);
  const [note, setNote] = useState(initialReview.note ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/finding-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingKey, status, note }),
      });
      const body: unknown = await response.json();
      if (!isReviewResponse(body)) throw new Error("Invalid response");
      if (!body.ok) {
        setMessage({ error: true, text: body.message });
        return;
      }
      setSavedReview(body.review);
      setStatus(body.review.status);
      setNote(body.review.note ?? "");
      setMessage({ error: false, text: "İnceleme kaydedildi." });
      router.refresh();
    } catch {
      setMessage({ error: true, text: "İnceleme kaydedilemedi. Lütfen tekrar deneyin." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-labelledby="review-title" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="review-title" className="text-lg font-semibold">İnceleme kararı</h2>
        <ReviewState status={savedReview.status} />
      </div>
      <form onSubmit={save} className="mt-5 space-y-5">
        <div>
          <label htmlFor="review-status" className="mb-2 block text-sm font-semibold">Durum</label>
          <select id="review-status" value={status} disabled={saving}
            onChange={(event) => { if (isReviewStatus(event.target.value)) { setStatus(event.target.value); setMessage(null); } }}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 sm:max-w-xs">
            {Object.entries(REVIEW_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="review-note" className="mb-2 block text-sm font-semibold">İnceleme notu</label>
          <textarea id="review-note" value={note} disabled={saving} rows={5} maxLength={MAX_REVIEW_NOTE_LENGTH}
            onChange={(event) => { setNote(event.target.value); setMessage(null); }}
            aria-describedby="review-note-limit"
            className="w-full rounded-lg border border-slate-300 p-3 text-base focus:outline-blue-600" />
          <p id="review-note-limit" className="mt-1 text-sm text-slate-500">İsteğe bağlı · {note.length}/{MAX_REVIEW_NOTE_LENGTH} karakter</p>
        </div>
        <button type="submit" disabled={saving} className="min-h-11 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
          {saving ? "Kaydediliyor…" : "İncelemeyi Kaydet"}
        </button>
        {message && <p role={message.error ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${message.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message.text}</p>}
      </form>
    </section>
  );
}
