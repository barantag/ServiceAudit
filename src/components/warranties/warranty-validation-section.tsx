import type { WarrantyRowsValidationResult } from "@/lib/warranties/row-validation";

type WarrantyValidationSectionProps = {
  result: WarrantyRowsValidationResult;
};

const ISSUE_DISPLAY_LIMIT = 20;
const numberFormatter = new Intl.NumberFormat("tr-TR");

export function WarrantyValidationSection({
  result,
}: WarrantyValidationSectionProps) {
  const hasErrors = result.ready && result.issueCount > 0;
  const displayedIssues = result.ready
    ? result.issues.slice(0, ISSUE_DISPLAY_LIMIT)
    : [];

  return (
    <section
      aria-labelledby="warranty-validation-title"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <h2 id="warranty-validation-title" className="text-lg font-semibold">
            4. Veri Doğrulama
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Ekipman kodu, garanti tarihleri ve tarih aralığı her satır için
            kontrol edilir.
          </p>
        </div>

        <ValidationStatus result={result} />
      </div>

      <div className="px-5 py-5 sm:px-7">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard
            label="Toplam satır"
            value={numberFormatter.format(result.totalRowCount)}
          />
          <SummaryCard
            label="Geçerli satır"
            value={result.ready ? numberFormatter.format(result.validRowCount) : "—"}
          />
          <SummaryCard
            label="Hatalı satır"
            value={result.ready ? numberFormatter.format(result.invalidRowCount) : "—"}
          />
          <SummaryCard
            label="Toplam doğrulama hatası"
            value={result.ready ? numberFormatter.format(result.issueCount) : "—"}
          />
        </dl>

        {!result.ready && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            <span className="font-semibold">Doğrulama henüz başlamadı.</span>{" "}
            Ekipman Kodu ile garanti başlangıç ve bitiş tarihi alanlarını
            eşledikten sonra tüm satırlar otomatik olarak kontrol edilecek.
          </div>
        )}

        {result.ready && !hasErrors && (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
            Tüm garanti satırları mevcut doğrulama kurallarını geçti.
          </div>
        )}

        {result.ready && hasErrors && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Doğrulama hataları
              </h3>
              <span className="text-sm text-slate-500">
                İlk {numberFormatter.format(displayedIssues.length)} hata
                gösteriliyor
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold">
                      Kaynak satır
                    </th>
                    <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold">
                      Garanti alanı
                    </th>
                    <th className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold">
                      Orijinal değer
                    </th>
                    <th className="min-w-72 border-b border-slate-200 px-4 py-3 font-semibold">
                      Hata
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {displayedIssues.map((issue, issueIndex) => (
                    <tr
                      key={`${issue.sourceRowNumber}-${issue.field}-${issueIndex}`}
                      className="align-top"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-900">
                        Satır {numberFormatter.format(issue.sourceRowNumber)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {issue.fieldLabel}
                      </td>
                      <td className="max-w-64 px-4 py-3 text-slate-700">
                        <code
                          className="block max-w-64 whitespace-pre-wrap break-words rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800"
                          title={issue.originalValue}
                        >
                          {`'${issue.originalValue}'`}
                        </code>
                      </td>
                      <td className="px-4 py-3 leading-6 text-red-700">
                        {issue.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.issueCount > ISSUE_DISPLAY_LIMIT && (
              <p className="mt-3 text-sm text-slate-600">
                {numberFormatter.format(
                  result.issueCount - ISSUE_DISPLAY_LIMIT,
                )} hata daha var. Bu ekranda en fazla {ISSUE_DISPLAY_LIMIT} hata
                gösterilir.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ValidationStatus({ result }: WarrantyValidationSectionProps) {
  if (!result.ready) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800"
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-amber-500" />
        Doğrulama bekleniyor
      </div>
    );
  }

  const hasErrors = result.issueCount > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
        hasErrors
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${hasErrors ? "bg-red-500" : "bg-emerald-500"}`}
      />
      {hasErrors
        ? "Düzeltilmesi gereken satırlar var"
        : "Veri doğrulamadan geçti"}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-slate-950">{value}</dd>
    </div>
  );
}
