"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  isImportAnalysisStateResponse,
  MAX_EXCLUSION_REASON_LENGTH,
  type ImportAnalysisAction,
} from "@/lib/imports/import-analysis-state-contract";

type ImportAnalysisStateActionProps = {
  importId: string;
  fileName: string;
  excluded: boolean;
};

export function ImportAnalysisStateAction({
  importId,
  fileName,
  excluded,
}: ImportAnalysisStateActionProps) {
  const router = useRouter();
  const action: ImportAnalysisAction = excluded ? "restore" : "exclude";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/imports/${encodeURIComponent(importId)}/analysis-state`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, reason: action === "exclude" ? reason : null }),
        },
      );
      const responseBody: unknown = await response.json();
      if (!isImportAnalysisStateResponse(responseBody)) {
        throw new Error("Invalid response");
      }
      if (!responseBody.ok) {
        setMessage({ error: true, text: responseBody.message });
        return;
      }

      setMessage({
        error: false,
        text: action === "exclude"
          ? "İçe aktarma analizden çıkarıldı."
          : "İçe aktarma yeniden analize alındı.",
      });
      setDialogOpen(false);
      setReason("");
      router.refresh();
    } catch {
      setMessage({
        error: true,
        text: "İçe aktarmanın analiz durumu değiştirilemedi. Lütfen tekrar deneyin.",
      });
    } finally {
      setSaving(false);
    }
  }

  function closeDialog() {
    if (saving) {
      return;
    }
    setDialogOpen(false);
    setReason("");
  }

  return (
    <div className="min-w-36">
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setDialogOpen(true);
        }}
        className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-100"
      >
        {excluded ? "Analize Geri Al" : "Analizden Çıkar"}
      </button>

      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`mt-2 max-w-64 text-xs leading-5 ${message.error ? "text-red-700" : "text-emerald-700"}`}
        >
          {message.text}
        </p>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`import-analysis-dialog-${importId}`}
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-xl sm:p-7"
          >
            <p className="text-sm font-semibold text-blue-700">İÇE AKTARMA ANALİZ DURUMU</p>
            <h2
              id={`import-analysis-dialog-${importId}`}
              className="mt-2 text-2xl font-semibold tracking-tight text-slate-950"
            >
              {excluded ? "İçe aktarmayı analize geri al" : "İçe aktarmayı analizden çıkar"}
            </h2>
            <p className="mt-3 break-words text-sm font-semibold text-slate-800">{fileName}</p>

            {excluded ? (
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Bu içe aktarmaya bağlı mevcut kayıt kimlikleri korunarak veriler yeniden
                analize katılır. Güncel bulgular ve yönetici özeti yeniden hesaplanır.
              </p>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                <p>Kaynak kayıtlar, ham satır değerleri ve inceleme kararları silinmez.</p>
                <p className="mt-1">Güncel bulgular ve yönetici özeti aktif verilere göre yeniden hesaplanır.</p>
              </div>
            )}

            <form onSubmit={submit} className="mt-5 space-y-5">
              {!excluded && (
                <div>
                  <label htmlFor={`exclusion-reason-${importId}`} className="mb-2 block text-sm font-semibold text-slate-800">
                    Analizden çıkarma gerekçesi
                  </label>
                  <textarea
                    id={`exclusion-reason-${importId}`}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={saving}
                    required
                    maxLength={MAX_EXCLUSION_REASON_LENGTH}
                    rows={4}
                    placeholder="Örneğin: Test dosyası yanlışlıkla içe aktarıldı."
                    className="w-full rounded-lg border border-slate-300 p-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {reason.length}/{MAX_EXCLUSION_REASON_LENGTH} karakter
                  </p>
                </div>
              )}

              {message?.error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {message.text}
                </p>
              )}

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={saving}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={saving || (!excluded && reason.trim().length === 0)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Kaydediliyor…"
                    : excluded
                      ? "Analize Geri Al"
                      : "Analizden Çıkar"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
