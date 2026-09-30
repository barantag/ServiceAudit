export type TabularPreview = {
  fileName: string;
  worksheetName: string | null;
  columns: string[];
  rows: string[][];
  sourceRows: TabularSourceRow[];
  totalRowCount: number;
};

export type TabularCellIssue = {
  columnIndex: number;
  message: string;
};

export type TabularSourceRow = {
  sourceRowNumber: number;
  values: string[];
  cellIssues?: TabularCellIssue[];
};

export type TabularParseErrorCode =
  | "unsupported-file"
  | "empty-file"
  | "missing-headers"
  | "parse-error";

export type TabularParseResult =
  | { ok: true; preview: TabularPreview }
  | { ok: false; code: TabularParseErrorCode; message: string };

const PREVIEW_ROW_LIMIT = 5;

export function createTabularPreview(
  fileName: string,
  worksheetName: string | null,
  sourceRows: readonly TabularSourceRow[],
  sourceLabel: "CSV dosyası" | "Excel çalışma sayfası",
): TabularParseResult {
  const nonEmptyRows = sourceRows.filter((row) => !isEmptyRow(row));

  if (nonEmptyRows.length === 0) {
    return {
      ok: false,
      code: "empty-file",
      message: `${sourceLabel} boş. Başlık satırı ve en az bir sütun bulunmalıdır.`,
    };
  }

  const [headerRow, ...dataRows] = nonEmptyRows;
  const columns = headerRow.values.map((header) => header.trim());

  if (
    headerRow.cellIssues?.length ||
    !hasValidHeaders(columns) ||
    looksLikeHeaderlessData(columns, dataRows[0]?.values)
  ) {
    return {
      ok: false,
      code: "missing-headers",
      message: `${sourceLabel} içinde geçerli bir başlık satırı bulunamadı. İlk dolu satırda benzersiz sütun adları olmalıdır.`,
    };
  }

  const inconsistentRow = dataRows.find(
    (row) => row.values.length !== columns.length,
  );

  if (inconsistentRow) {
    return {
      ok: false,
      code: "parse-error",
      message: `${sourceLabel} içindeki ${inconsistentRow.sourceRowNumber}. satır, başlık satırıyla aynı sayıda sütun içermiyor.`,
    };
  }

  return {
    ok: true,
    preview: {
      fileName,
      worksheetName,
      columns,
      rows: dataRows.slice(0, PREVIEW_ROW_LIMIT).map((row) => [...row.values]),
      sourceRows: dataRows.map((row) => ({
        sourceRowNumber: row.sourceRowNumber,
        values: [...row.values],
        ...(row.cellIssues?.length
          ? { cellIssues: row.cellIssues.map((issue) => ({ ...issue })) }
          : {}),
      })),
      totalRowCount: dataRows.length,
    },
  };
}

export function isEmptyRow(row: TabularSourceRow): boolean {
  return row.values.every((value) => value.trim().length === 0)
    && !row.cellIssues?.length;
}

function hasValidHeaders(columns: string[]): boolean {
  if (columns.length === 0 || columns.some((column) => column.length === 0)) {
    return false;
  }

  const normalizedColumns = columns.map((column) =>
    column.toLocaleLowerCase("tr-TR"),
  );

  return new Set(normalizedColumns).size === normalizedColumns.length;
}

function looksLikeHeaderlessData(
  firstRow: string[],
  secondRow: string[] | undefined,
): boolean {
  const dataLikeIndexes = firstRow
    .map((value, index) => (looksLikeDataValue(value) ? index : -1))
    .filter((index) => index !== -1);

  if (dataLikeIndexes.length === firstRow.length) {
    return true;
  }

  return Boolean(
    secondRow &&
      dataLikeIndexes.length > 0 &&
      dataLikeIndexes.every((index) => looksLikeDataValue(secondRow[index] ?? "")),
  );
}

function looksLikeDataValue(value: string): boolean {
  const normalizedValue = value.trim().toLocaleLowerCase("tr-TR");

  if (normalizedValue.length === 0) {
    return false;
  }

  const isNumber = /^[-+]?\d+(?:[.,]\d+)?$/.test(normalizedValue);
  const isDate =
    /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(normalizedValue) ||
    /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(normalizedValue);
  const isBoolean = ["true", "false", "evet", "hayır"].includes(
    normalizedValue,
  );

  return isNumber || isDate || isBoolean;
}
