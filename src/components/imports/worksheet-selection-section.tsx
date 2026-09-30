type WorksheetSelectionSectionProps = {
  fileName: string;
  worksheetNames: readonly string[];
  selectedWorksheetName: string | null;
  disabled: boolean;
  errorMessage?: string;
  onSelect: (worksheetName: string) => void;
};

export function WorksheetSelectionSection({
  fileName,
  worksheetNames,
  selectedWorksheetName,
  disabled,
  errorMessage,
  onSelect,
}: WorksheetSelectionSectionProps) {
  return (
    <section
      aria-labelledby="worksheet-selection-title"
      className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
    >
      <h2 id="worksheet-selection-title" className="text-lg font-semibold">
        Çalışma sayfası seçimi
      </h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        <span className="font-medium text-slate-700">{fileName}</span> içinde
        birden fazla dolu çalışma sayfası bulundu. İçe aktarılacak sayfayı seçin.
      </p>
      <label className="mt-5 grid max-w-md gap-2 text-sm font-semibold text-slate-700">
        Çalışma sayfası
        <select
          aria-label="Çalışma sayfası"
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          value={selectedWorksheetName ?? ""}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value) {
              onSelect(event.target.value);
            }
          }}
        >
          <option value="" disabled>Bir çalışma sayfası seçin</option>
          {worksheetNames.map((worksheetName) => (
            <option key={worksheetName} value={worksheetName}>
              {worksheetName}
            </option>
          ))}
        </select>
      </label>
      {errorMessage && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
        >
          {errorMessage}
        </div>
      )}
    </section>
  );
}
