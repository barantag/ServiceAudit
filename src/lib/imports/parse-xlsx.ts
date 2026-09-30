import type ExcelJS from "exceljs";
import {
  createTabularPreview,
  isEmptyRow,
  type TabularCellIssue,
  type TabularParseResult,
  type TabularSourceRow,
} from "@/lib/imports/tabular-data";

export type ParsedWorksheet = {
  name: string;
  result: TabularParseResult;
};

export type XlsxWorkbookParseResult =
  | { ok: true; worksheets: ParsedWorksheet[] }
  | { ok: false; message: string };

export async function parseXlsxWorkbook(
  fileName: string,
  fileBytes: Uint8Array,
): Promise<XlsxWorkbookParseResult> {
  if (!fileName.toLocaleLowerCase("tr-TR").endsWith(".xlsx")) {
    return {
      ok: false,
      message: "Bu dosya türü desteklenmiyor. Excel (.xlsx) veya CSV (.csv) seçin; .xls desteklenmez.",
    };
  }

  try {
    const { default: ExcelJSImport } = await import("exceljs");
    const workbook = new ExcelJSImport.Workbook();
    const workbookBuffer = new ArrayBuffer(fileBytes.byteLength);
    new Uint8Array(workbookBuffer).set(fileBytes);
    await workbook.xlsx.load(
      workbookBuffer as Parameters<typeof workbook.xlsx.load>[0],
    );

    const worksheets = workbook.worksheets
      .map((worksheet) => parseWorksheet(fileName, worksheet))
      .filter((worksheet): worksheet is ParsedWorksheet => worksheet !== null);

    if (worksheets.length === 0) {
      return {
        ok: false,
        message: "Excel çalışma kitabında dolu bir çalışma sayfası bulunamadı.",
      };
    }

    return { ok: true, worksheets };
  } catch {
    return {
      ok: false,
      message: "Excel dosyası okunamadı. Dosyanın geçerli bir .xlsx çalışma kitabı olduğundan emin olun.",
    };
  }
}

function parseWorksheet(
  fileName: string,
  worksheet: ExcelJS.Worksheet,
): ParsedWorksheet | null {
  const rows: TabularSourceRow[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values: string[] = [];
    const cellIssues: TabularCellIssue[] = [];
    let lastMeaningfulColumn = 0;

    for (let columnNumber = 1; columnNumber <= row.cellCount; columnNumber += 1) {
      const cellResult = readCellValue(row.getCell(columnNumber).value);
      values[columnNumber - 1] = cellResult.value;

      if (cellResult.issue) {
        cellIssues.push({
          columnIndex: columnNumber - 1,
          message: cellResult.issue,
        });
      }
      if (cellResult.value.trim().length > 0 || cellResult.issue) {
        lastMeaningfulColumn = columnNumber;
      }
    }

    rows.push({
      sourceRowNumber: rowNumber,
      values: values.slice(0, lastMeaningfulColumn),
      ...(cellIssues.length ? { cellIssues } : {}),
    });
  });

  const nonEmptyRows = rows.filter((row) => !isEmptyRow(row));
  if (nonEmptyRows.length === 0) {
    return null;
  }

  const headerWidth = nonEmptyRows[0].values.length;
  const normalizedRows = nonEmptyRows.map((row, index) => {
    if (index === 0 || row.values.length > headerWidth) {
      return row;
    }
    return {
      ...row,
      values: Array.from(
        { length: headerWidth },
        (_, columnIndex) => row.values[columnIndex] ?? "",
      ),
    };
  });

  return {
    name: worksheet.name,
    result: createTabularPreview(
      fileName,
      worksheet.name,
      normalizedRows,
      "Excel çalışma sayfası",
    ),
  };
}

function readCellValue(value: ExcelJS.CellValue): {
  value: string;
  issue?: string;
} {
  if (value === null || value === undefined) {
    return { value: "" };
  }
  if (typeof value === "string") {
    return { value };
  }
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? { value: String(value) }
      : unsupportedCellResult();
  }
  if (typeof value === "boolean") {
    return { value: String(value) };
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? unsupportedCellResult()
      : { value: formatDate(value) };
  }

  if ("formula" in value || "sharedFormula" in value) {
    return readFormulaResult(value.result);
  }
  if ("richText" in value) {
    return { value: value.richText.map((part) => part.text).join("") };
  }
  if ("hyperlink" in value) {
    return { value: value.text };
  }

  return unsupportedCellResult();
}

function readFormulaResult(result: ExcelJS.CellFormulaValue["result"]): {
  value: string;
  issue?: string;
} {
  if (
    typeof result === "string"
    || typeof result === "boolean"
    || (typeof result === "number" && Number.isFinite(result))
  ) {
    return { value: String(result) };
  }
  if (result instanceof Date && !Number.isNaN(result.getTime())) {
    return { value: formatDate(result) };
  }
  return {
    value: "",
    issue: "Formül çalıştırılmadı ve güvenli bir önbellek sonucu bulunamadı.",
  };
}

function unsupportedCellResult(): { value: string; issue: string } {
  return {
    value: "",
    issue: "Hücre değeri güvenli biçimde okunamadı.",
  };
}

function formatDate(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
