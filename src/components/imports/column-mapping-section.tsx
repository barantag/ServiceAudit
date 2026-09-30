import type { ChangeEvent } from "react";
import {
  getMissingRequiredFields,
  isColumnMappingTarget,
  isTargetMappedToAnotherColumn,
  SERVICE_AUDIT_FIELDS,
  type ColumnMapping,
  type ColumnMappingTarget,
} from "@/lib/imports/column-mapping";

type ColumnMappingSectionProps = {
  mappings: readonly ColumnMapping[];
  disabled?: boolean;
  onMappingChange: (
    mappingIndex: number,
    target: ColumnMappingTarget,
  ) => void;
};

export function ColumnMappingSection({
  mappings,
  disabled = false,
  onMappingChange,
}: ColumnMappingSectionProps) {
  const missingRequiredFields = getMissingRequiredFields(mappings);
  const isReady = missingRequiredFields.length === 0;

  function handleChange(
    event: ChangeEvent<HTMLSelectElement>,
    mappingIndex: number,
  ) {
    const target = event.target.value;

    if (isColumnMappingTarget(target)) {
      onMappingChange(mappingIndex, target);
    }
  }

  return (
    <section
      aria-labelledby="column-mapping-title"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <h2 id="column-mapping-title" className="text-lg font-semibold">
            3. Sütun Eşleme
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Dosya sütunlarını ServiceAudit alanlarıyla eşleştirin. Kullanmayacağınız
            sütunları atlayabilirsiniz.
          </p>
        </div>

        <div
          role="status"
          aria-live="polite"
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
            isReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${isReady ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          {isReady ? "Eşleme hazır" : "Zorunlu alan eksik"}
        </div>
      </div>

      <div className="px-5 py-5 sm:px-7">
        <div
          className={`mb-5 rounded-lg border px-4 py-3 text-sm leading-6 ${
            isReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          {isReady ? (
            <>
              <span className="font-semibold">Zorunlu eşleme tamamlandı.</span>{" "}
              Seçimleri içe aktarma işleminden önce değiştirebilirsiniz.
            </>
          ) : (
            <>
              <span className="font-semibold">Servis Tarihi zorunludur.</span>{" "}
              Bir dosya sütununu Servis Tarihi alanıyla eşleştirin.
            </>
          )}
        </div>

        <div className="hidden grid-cols-[minmax(0,1fr)_minmax(18rem,1fr)] gap-6 border-b border-slate-200 px-4 pb-3 text-sm font-semibold text-slate-600 md:grid">
          <span>Dosya sütunu</span>
          <span>ServiceAudit alanı</span>
        </div>

        <div className="divide-y divide-slate-200">
          {mappings.map((mapping, mappingIndex) => {
            const selectId = `column-mapping-${mappingIndex}`;
            const showsAutomaticSuggestion =
              mapping.suggestedTarget !== null &&
              mapping.target === mapping.suggestedTarget;

            return (
              <div
                key={mapping.sourceColumn}
                className="grid gap-3 px-1 py-4 md:grid-cols-[minmax(0,1fr)_minmax(18rem,1fr)] md:items-center md:gap-6 md:px-4"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">
                    Dosya sütunu
                  </p>
                  <label
                    htmlFor={selectId}
                    className="mt-1 block truncate text-sm font-semibold text-slate-900 md:mt-0"
                    title={mapping.sourceColumn}
                  >
                    {mapping.sourceColumn}
                  </label>
                </div>

                <div className="min-w-0">
                  <div className="mb-1.5 flex min-h-5 items-center justify-between gap-3 md:mb-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:hidden">
                      ServiceAudit alanı
                    </p>
                    {showsAutomaticSuggestion && (
                      <span className="text-xs font-medium text-blue-700 md:mb-1.5 md:ml-auto">
                        Otomatik öneri
                      </span>
                    )}
                  </div>
                  <select
                    id={selectId}
                    value={mapping.target}
                    disabled={disabled}
                    onChange={(event) => handleChange(event, mappingIndex)}
                    className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="ignore">Bu sütunu kullanma</option>
                    {SERVICE_AUDIT_FIELDS.map((field) => {
                      const isAssignedElsewhere =
                        isTargetMappedToAnotherColumn(
                          mappings,
                          mappingIndex,
                          field.key,
                        );

                      return (
                        <option
                          key={field.key}
                          value={field.key}
                          disabled={isAssignedElsewhere}
                        >
                          {field.label}
                          {field.required ? " (zorunlu)" : ""}
                          {isAssignedElsewhere ? " — başka sütunda" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
