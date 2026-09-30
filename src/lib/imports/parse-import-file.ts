import { parseCsvFile, parseCsvText } from "@/lib/imports/parse-csv";
import {
  parseXlsxWorkbook,
  type ParsedWorksheet,
} from "@/lib/imports/parse-xlsx";
import type { TabularParseResult, TabularPreview } from "@/lib/imports/tabular-data";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROW_COUNT,
} from "@/lib/imports/import-limits";

export type ImportFileFormat = "csv" | "xlsx";

export type BrowserImportFileResult =
  | { ok: true; format: "csv"; preview: TabularPreview; worksheets: [] }
  | { ok: true; format: "xlsx"; worksheets: ParsedWorksheet[] }
  | { ok: false; message: string };

export type ServerImportFileResult =
  | {
      ok: true;
      format: ImportFileFormat;
      preview: TabularPreview;
      selectedWorksheetName: string | null;
    }
  | { ok: false; message: string };

export async function parseImportFile(
  file: File,
): Promise<BrowserImportFileResult> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return {
      ok: false,
      message: "Veri dosyası en fazla 10 MB olabilir. Dosya küçültülmeden içe aktarma yapılmadı.",
    };
  }

  const format = getImportFileFormat(file.name);
  if (format === null) {
    return unsupportedFileResult();
  }
  if (format === "csv") {
    const result = await parseCsvFile(file);
    const limitedResult = validatePreviewRowCount(result);
    return limitedResult.ok
      ? { ok: true, format, preview: limitedResult.preview, worksheets: [] }
      : limitedResult;
  }

  const workbookResult = await parseXlsxWorkbook(
    file.name,
    new Uint8Array(await file.arrayBuffer()),
  );
  return workbookResult.ok
    ? {
        ok: true,
        format,
        worksheets: workbookResult.worksheets.map((worksheet) => ({
          ...worksheet,
          result: validatePreviewRowCount(worksheet.result),
        })),
      }
    : workbookResult;
}

export async function parseImportFileBytes(
  fileName: string,
  fileBytes: Uint8Array,
  requestedWorksheetName: unknown,
): Promise<ServerImportFileResult> {
  const format = getImportFileFormat(fileName);
  if (format === null) {
    return unsupportedFileResult();
  }
  if (format === "csv") {
    if (
      requestedWorksheetName !== null
      && requestedWorksheetName !== undefined
      && requestedWorksheetName !== ""
    ) {
      return { ok: false, message: "CSV dosyası için çalışma sayfası seçilemez." };
    }
    const csvText = new TextDecoder("utf-8").decode(fileBytes);
    return toServerResult(format, parseCsvText(fileName, csvText), null);
  }

  const workbookResult = await parseXlsxWorkbook(fileName, fileBytes);
  if (!workbookResult.ok) {
    return workbookResult;
  }

  const selectedWorksheetName = resolveWorksheetName(
    workbookResult.worksheets,
    requestedWorksheetName,
  );
  if (!selectedWorksheetName.ok) {
    return selectedWorksheetName;
  }
  const selectedWorksheet = workbookResult.worksheets.find(
    (worksheet) => worksheet.name === selectedWorksheetName.name,
  );
  if (!selectedWorksheet) {
    return { ok: false, message: "Seçilen çalışma sayfası dosyada bulunamadı." };
  }
  return toServerResult(format, selectedWorksheet.result, selectedWorksheet.name);
}

export function getImportFileFormat(fileName: string): ImportFileFormat | null {
  const normalizedName = fileName.toLocaleLowerCase("tr-TR");
  if (normalizedName.endsWith(".csv")) {
    return "csv";
  }
  if (normalizedName.endsWith(".xlsx")) {
    return "xlsx";
  }
  return null;
}

function resolveWorksheetName(
  worksheets: readonly ParsedWorksheet[],
  requestedWorksheetName: unknown,
): { ok: true; name: string } | { ok: false; message: string } {
  if (worksheets.length === 1 && (
    requestedWorksheetName === null
    || requestedWorksheetName === undefined
    || requestedWorksheetName === ""
  )) {
    return { ok: true, name: worksheets[0].name };
  }
  if (typeof requestedWorksheetName !== "string" || requestedWorksheetName.length === 0) {
    return { ok: false, message: "İçe aktarılacak Excel çalışma sayfasını seçin." };
  }
  return worksheets.some((worksheet) => worksheet.name === requestedWorksheetName)
    ? { ok: true, name: requestedWorksheetName }
    : { ok: false, message: "Seçilen çalışma sayfası dosyada bulunamadı." };
}

function toServerResult(
  format: ImportFileFormat,
  result: TabularParseResult,
  selectedWorksheetName: string | null,
): ServerImportFileResult {
  if (!result.ok) {
    return result;
  }
  return result.preview.totalRowCount <= MAX_IMPORT_ROW_COUNT
    ? { ok: true, format, preview: result.preview, selectedWorksheetName }
    : rowLimitResult();
}

function unsupportedFileResult(): { ok: false; message: string } {
  return {
    ok: false,
    message: "Bu dosya türü desteklenmiyor. Excel (.xlsx) veya CSV (.csv) seçin; .xls desteklenmez.",
  };
}

function validatePreviewRowCount(result: TabularParseResult): TabularParseResult {
  if (!result.ok) {
    return result;
  }
  return result.preview.totalRowCount <= MAX_IMPORT_ROW_COUNT
    ? result
    : { ok: false, code: "parse-error", message: rowLimitResult().message };
}

function rowLimitResult(): { ok: false; message: string } {
  return {
    ok: false,
    message: "Bir veri dosyasında en fazla 25.000 veri satırı olabilir. Hiçbir satır içe aktarılmadı.",
  };
}
