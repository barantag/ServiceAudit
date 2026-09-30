"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { AppHeader } from "@/components/app-header";
import { ColumnMappingSection } from "@/components/imports/column-mapping-section";
import { DataValidationSection } from "@/components/imports/data-validation-section";
import {
  ImportActionSection,
  type ImportSubmissionState,
} from "@/components/imports/import-action-section";
import { WorksheetSelectionSection } from "@/components/imports/worksheet-selection-section";
import {
  createSubmittedColumnMappings,
  createColumnMappings,
  setColumnMappingTarget,
  type ColumnMapping,
  type ColumnMappingTarget,
} from "@/lib/imports/column-mapping";
import { isImportApiResponse } from "@/lib/imports/import-contract";
import {
  parseImportFile,
  type BrowserImportFileResult,
} from "@/lib/imports/parse-import-file";
import { validateMappedRows } from "@/lib/imports/row-validation";
import type { TabularPreview } from "@/lib/imports/tabular-data";

type XlsxWorksheets = Extract<
  BrowserImportFileResult,
  { ok: true; format: "xlsx" }
>["worksheets"];

type ImportViewState =
  | { status: "idle" }
  | { status: "processing"; fileName: string }
  | { status: "error"; message: string }
  | {
      status: "worksheet-selection";
      file: File;
      worksheets: XlsxWorksheets;
      selectedWorksheetName: string | null;
      errorMessage?: string;
    }
  | {
      status: "success";
      file: File;
      preview: TabularPreview;
      worksheets?: XlsxWorksheets;
    };

const numberFormatter = new Intl.NumberFormat("tr-TR");

export function CsvImportPreview({ organizationName }: { organizationName: string }) {
  const [viewState, setViewState] = useState<ImportViewState>({ status: "idle" });
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [importState, setImportState] = useState<ImportSubmissionState>({
    status: "idle",
  });
  const requestIdRef = useRef(0);
  const validationResult = useMemo(() => {
    if (viewState.status !== "success") {
      return null;
    }

    return validateMappedRows(viewState.preview.sourceRows, columnMappings);
  }, [columnMappings, viewState]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setColumnMappings([]);
    setImportState({ status: "idle" });
    setViewState({ status: "processing", fileName: file.name });

    const result = await parseImportFile(file);

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (result.ok && result.format === "csv") {
      setColumnMappings(createColumnMappings(result.preview.columns));
      setViewState({ status: "success", file, preview: result.preview });
    } else if (result.ok && result.worksheets.length === 1) {
      selectWorksheet(file, result.worksheets, result.worksheets[0].name);
    } else if (result.ok) {
      setViewState({
        status: "worksheet-selection",
        file,
        worksheets: result.worksheets,
        selectedWorksheetName: null,
      });
    } else {
      setViewState({ status: "error", message: result.message });
    }
  }

  function selectWorksheet(
    file: File,
    worksheets: XlsxWorksheets,
    worksheetName: string,
  ) {
    const worksheet = worksheets.find(
      (candidate) => candidate.name === worksheetName,
    );
    if (!worksheet) {
      setViewState({
        status: "worksheet-selection",
        file,
        worksheets,
        selectedWorksheetName: worksheetName,
        errorMessage: "Seçilen çalışma sayfası okunamadı.",
      });
      return;
    }
    if (!worksheet.result.ok) {
      setViewState({
        status: "worksheet-selection",
        file,
        worksheets,
        selectedWorksheetName: worksheetName,
        errorMessage: worksheet.result.message,
      });
      return;
    }

    setColumnMappings(createColumnMappings(worksheet.result.preview.columns));
    setImportState({ status: "idle" });
    setViewState({
      status: "success",
      file,
      preview: worksheet.result.preview,
      ...(worksheets.length > 1 ? { worksheets } : {}),
    });
  }

  function handleMappingChange(
    mappingIndex: number,
    target: ColumnMappingTarget,
  ) {
    setColumnMappings((currentMappings) =>
      setColumnMappingTarget(currentMappings, mappingIndex, target),
    );
    setImportState((currentState) =>
      currentState.status === "success" ? currentState : { status: "idle" },
    );
  }

  async function handleImport() {
    if (
      viewState.status !== "success" ||
      !validationResult?.ready ||
      validationResult.issueCount > 0 ||
      validationResult.totalRowCount === 0 ||
      importState.status === "submitting" ||
      importState.status === "success"
    ) {
      return;
    }

    setImportState({ status: "submitting" });

    const formData = new FormData();
    formData.set("file", viewState.file);
    formData.set(
      "mapping",
      JSON.stringify(createSubmittedColumnMappings(columnMappings)),
    );
    if (viewState.preview.worksheetName !== null) {
      formData.set("worksheet", viewState.preview.worksheetName);
    }

    try {
      const response = await fetch("/api/imports", {
        method: "POST",
        body: formData,
      });
      const responseBody: unknown = await response.json();

      if (!isImportApiResponse(responseBody)) {
        setImportState({
          status: "error",
          message: "Sunucudan geçerli bir yanıt alınamadı.",
        });
        return;
      }

      if (responseBody.ok) {
        setImportState({
          status: "success",
          importId: responseBody.importId,
          rowCount: responseBody.rowCount,
        });
        return;
      }

      setImportState({
        status: "error",
        code: responseBody.code,
        message: responseBody.message,
      });
    } catch {
      setImportState({
        status: "error",
        message: "Sunucuya ulaşılamadı. Lütfen tekrar deneyin.",
      });
    }
  }

  const isProcessing = viewState.status === "processing";
  const isImporting = importState.status === "submitting";
  const isImportComplete = importState.status === "success";
  const hasImportableData = Boolean(
    validationResult?.ready &&
      validationResult.issueCount === 0 &&
      validationResult.totalRowCount > 0,
  );

  return (
    <div lang="tr" className="min-h-screen bg-slate-50 text-slate-950">
      <AppHeader
        activeItem="service-import"
        organizationName={organizationName}
        contextLabel={isImporting || isImportComplete
          ? "Adım 4 · İçe aktarma"
          : validationResult?.ready
            ? "Adım 3 · Veri doğrulama"
            : viewState.status === "success"
              ? "Adım 2 · Sütun eşleme"
              : viewState.status === "worksheet-selection"
                ? "Adım 2 · Çalışma sayfası"
                : "Adım 1 · Veri dosyası"}
      />

      <main className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="mb-8 max-w-3xl">
          <p className="mb-2 text-sm font-semibold text-blue-700">SERVİS KAYITLARI</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Servis verisi dosyasını yükleyin
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-600">
            Dosyanızı seçin ve kaydetmeden önce sütunları ile ilk satırları kontrol
            edin. Önizleme tarayıcıda hazırlanır; içe aktarma sırasında dosya
            sunucuda yeniden doğrulanır.
          </p>
        </div>

        <div className="max-w-6xl">
          <section
            aria-labelledby="file-selection-title"
            className="rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
          <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <h2 id="file-selection-title" className="text-lg font-semibold">
              1. Dosya
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Excel (.xlsx) veya CSV (.csv)
            </p>
          </div>

          <div className="p-5 sm:p-7">
            <div className="flex flex-col items-start gap-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="size-5"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path
                      d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 13.5v4A2.5 2.5 0 007.5 20h9a2.5 2.5 0 002.5-2.5v-4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    Bilgisayarınızdan bir servis verisi dosyası seçin
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    İlk satır sütun adlarını içermelidir. Boş satırlar sayılmaz.
                  </p>
                </div>
              </div>

              <label
                className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600 ${
                  isProcessing || isImporting
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:bg-slate-700"
                }`}
              >
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  className="sr-only"
                  disabled={isProcessing || isImporting}
                  onChange={handleFileChange}
                />
                {isProcessing
                  ? "Dosya okunuyor…"
                  : isImporting
                    ? "İçe aktarma sürüyor…"
                    : "Veri dosyası seç"}
              </label>
            </div>

            <div aria-live="polite" aria-atomic="true">
              {viewState.status === "processing" && (
                <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
                  <span className="font-medium">{viewState.fileName}</span> yerel
                  olarak okunuyor…
                </div>
              )}

              {viewState.status === "error" && (
                <div
                  role="alert"
                  className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800"
                >
                  <span className="font-semibold">Dosya önizlenemedi.</span>{" "}
                  {viewState.message}
                  <p className="mt-1 text-red-700">
                    Dosyayı düzeltip veya başka bir dosya seçip tekrar deneyin.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {viewState.status === "worksheet-selection" && (
          <WorksheetSelectionSection
            fileName={viewState.file.name}
            worksheetNames={viewState.worksheets.map(
              (worksheet) => worksheet.name,
            )}
            selectedWorksheetName={viewState.selectedWorksheetName}
            disabled={isImporting || isImportComplete}
            errorMessage={viewState.errorMessage}
            onSelect={(worksheetName) =>
              selectWorksheet(
                viewState.file,
                viewState.worksheets,
                worksheetName,
              )}
          />
        )}

        {viewState.status === "success" && viewState.worksheets && (
          <WorksheetSelectionSection
            fileName={viewState.file.name}
            worksheetNames={viewState.worksheets.map(
              (worksheet) => worksheet.name,
            )}
            selectedWorksheetName={viewState.preview.worksheetName}
            disabled={isImporting || isImportComplete}
            onSelect={(worksheetName) =>
              selectWorksheet(
                viewState.file,
                viewState.worksheets!,
                worksheetName,
              )}
          />
        )}

        {viewState.status === "success" && (
          <>
            <PreviewDetails preview={viewState.preview} />
            <ColumnMappingSection
              disabled={isImporting || isImportComplete}
              mappings={columnMappings}
              onMappingChange={handleMappingChange}
            />
            {validationResult !== null && (
              <DataValidationSection result={validationResult} />
            )}
            {(hasImportableData || importState.status !== "idle") && (
              <ImportActionSection
                state={importState}
                onImport={handleImport}
              />
            )}
          </>
        )}
        </div>
      </main>
    </div>
  );
}

function PreviewDetails({ preview }: { preview: TabularPreview }) {
  return (
    <section
      aria-labelledby="preview-title"
      className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <p className="text-sm font-medium text-emerald-700">Dosya hazır</p>
          <h2 id="preview-title" className="mt-1 text-lg font-semibold">
            2. Algılanan sütunlar / Önizleme
          </h2>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <dt className="text-slate-500">Dosya adı</dt>
            <dd className="mt-1 max-w-64 truncate font-medium text-slate-900" title={preview.fileName}>
              {preview.fileName}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Toplam veri satırı</dt>
            <dd className="mt-1 font-medium text-slate-900">
              {numberFormatter.format(preview.totalRowCount)}
            </dd>
          </div>
          {preview.worksheetName && (
            <div>
              <dt className="text-slate-500">Çalışma sayfası</dt>
              <dd
                className="mt-1 max-w-64 truncate font-medium text-slate-900"
                title={preview.worksheetName}
              >
                {preview.worksheetName}
              </dd>
            </div>
          )}
        </dl>
      </div>

      <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-900">Algılanan sütunlar</h3>
          <span className="text-sm text-slate-500">
            {numberFormatter.format(preview.columns.length)} sütun
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {preview.columns.map((column) => (
            <span
              key={column}
              className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-medium text-slate-700"
            >
              {column}
            </span>
          ))}
        </div>
      </div>

      <div className="px-5 py-5 sm:px-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">İlk 5 veri satırı</h3>
          {preview.totalRowCount > 5 && (
            <span className="text-sm text-slate-500">
              {numberFormatter.format(preview.totalRowCount)} satırın ilk 5’i gösteriliyor
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                {preview.columns.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {preview.rows.length > 0 ? (
                preview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="max-w-80 whitespace-nowrap px-4 py-3 text-slate-700"
                        title={cell}
                      >
                        <span className="block max-w-80 truncate">
                          {cell || <span className="text-slate-400">Boş</span>}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={preview.columns.length}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    Dosyada başlık satırından sonra veri satırı bulunmuyor.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
