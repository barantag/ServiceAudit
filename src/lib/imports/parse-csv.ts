import Papa, { type ParseError } from "papaparse";
import {
  createTabularPreview,
  type TabularParseErrorCode,
  type TabularParseResult,
  type TabularPreview,
  type TabularSourceRow,
} from "@/lib/imports/tabular-data";

export type CsvPreview = TabularPreview;
export type CsvSourceRow = TabularSourceRow;
export type CsvParseErrorCode = TabularParseErrorCode;
export type CsvParseResult = TabularParseResult;

export async function parseCsvFile(file: File): Promise<CsvParseResult> {
  try {
    return parseCsvText(file.name, await file.text());
  } catch {
    return unreadableFileResult();
  }
}

export function parseCsvText(
  fileName: string,
  csvText: string,
): CsvParseResult {
  if (!fileName.toLocaleLowerCase("tr-TR").endsWith(".csv")) {
    return {
      ok: false,
      code: "unsupported-file",
      message: "Yalnızca .csv uzantılı dosyalar destekleniyor.",
    };
  }

  if (csvText.length === 0) {
    return emptyFileResult();
  }

  try {
    const result = Papa.parse<string[]>(csvText);

    return createPreviewResult(fileName, result.data, result.errors);
  } catch {
    return unreadableFileResult();
  }
}

function createPreviewResult(
  fileName: string,
  parsedRows: string[][],
  parseErrors: ParseError[],
): CsvParseResult {
  const blockingError = parseErrors.find(
    (error) => error.code !== "UndetectableDelimiter",
  );

  if (blockingError) {
    const rowNumber =
      typeof blockingError.row === "number" ? blockingError.row + 1 : null;

    return {
      ok: false,
      code: "parse-error",
      message: rowNumber
        ? `CSV ayrıştırılırken ${rowNumber}. satırda bir hata oluştu. Ayırıcıları ve tırnak işaretlerini kontrol edin.`
        : "CSV ayrıştırılırken bir hata oluştu. Ayırıcıları ve tırnak işaretlerini kontrol edin.",
    };
  }

  const sourceRows: CsvSourceRow[] = parsedRows
    .map((values, index) => ({
      sourceRowNumber: index + 1,
      values,
    }));

  return createTabularPreview(fileName, null, sourceRows, "CSV dosyası");
}

function emptyFileResult(): CsvParseResult {
  return {
    ok: false,
    code: "empty-file",
    message:
      "Dosya boş. Başlık satırı ve en az bir sütun içeren bir CSV dosyası seçin.",
  };
}

function unreadableFileResult(): CsvParseResult {
  return {
    ok: false,
    code: "parse-error",
    message:
      "CSV dosyası okunamadı. Dosyanın geçerli ve erişilebilir olduğundan emin olun.",
  };
}
