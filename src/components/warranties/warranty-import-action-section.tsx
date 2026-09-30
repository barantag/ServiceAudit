import Link from "next/link";
import type { ImportErrorCode } from "@/lib/imports/import-contract";

export type WarrantyImportSubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; importId: string; rowCount: number }
  | { status: "error"; message: string; code?: ImportErrorCode };

type WarrantyImportActionSectionProps = {
  state: WarrantyImportSubmissionState;
  onImport: () => void;
};

const numberFormatter = new Intl.NumberFormat("tr-TR");

export function WarrantyImportActionSection({
  state,
  onImport,
}: WarrantyImportActionSectionProps) {
  const isSubmitting = state.status === "submitting";
  const isComplete = state.status === "success";
  const isDuplicate = state.status === "error" && state.code === "DUPLICATE_IMPORT";
  const isDataError = state.status === "error" && (
    state.code === "INVALID_CSV"
    || state.code === "INVALID_MAPPING"
    || state.code === "INVALID_DATA"
    || state.code === "LIMIT_EXCEEDED"
    || state.code === "MALFORMED_REQUEST"
  );

  return (
    <section
      aria-labelledby="warranty-import-action-title"
      className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2
            id="warranty-import-action-title"
            className="text-lg font-semibold"
          >
            5. İçe Aktarma
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
            Doğrulanmış garanti kayıtlarını tek işlemde veritabanına kaydedin.
          </p>
        </div>

        {!isDuplicate && <button
          type="button"
          disabled={isSubmitting || isComplete}
          onClick={onImport}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting
            ? "İçe aktarılıyor…"
            : isComplete
              ? "İçe aktarıldı"
              : state.status === "error"
                ? "Tekrar dene"
                : "Garanti Kayıtlarını İçe Aktar"}
        </button>}
      </div>

      <div aria-live="polite" aria-atomic="true">
        {isSubmitting && (
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
            Dosya sunucuda yeniden doğrulanıyor ve garanti kayıtları atomik
            olarak hazırlanıyor.
          </div>
        )}

        {state.status === "success" && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
            <p className="font-semibold">
              İçe aktarma tamamlandı. {numberFormatter.format(state.rowCount)}{" "}
              garanti kaydı kaydedildi.
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              İçe aktarma kimliği:{" "}
              <code className="font-mono">{state.importId}</code>
            </p>
            <Link
              href="/findings"
              className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-emerald-300 bg-white px-3.5 text-sm font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
            >
              Bulguları Gör
            </Link>
          </div>
        )}

        {state.status === "error" && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
          >
            <p className="font-semibold">
              {isDuplicate ? "Bu dosya daha önce içe aktarılmış." : "İçe aktarma tamamlanamadı."}
            </p>
            {!isDuplicate && <p className="mt-1">{state.message}</p>}
            <p className="mt-2 text-sm text-red-700">
              {isDuplicate
                ? "Aynı dosya için yeni kayıt oluşturulmadı. Önceki işlemi veya mevcut bulguları inceleyebilirsiniz."
                : isDataError
                  ? "Dosya içeriğini ve sütun eşlemelerini gözden geçirip tekrar deneyin."
                  : "Seçili dosya ve eşlemeler korunuyor. Bağlantıyı kontrol edip tekrar deneyebilirsiniz."}
            </p>
            {isDuplicate && (
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href="/imports" className="inline-flex min-h-10 items-center rounded-lg border border-red-300 bg-white px-3.5 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100">İçe Aktarımları Gör</Link>
                <Link href="/findings" className="inline-flex min-h-10 items-center rounded-lg border border-red-300 bg-white px-3.5 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100">Bulguları Gör</Link>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
