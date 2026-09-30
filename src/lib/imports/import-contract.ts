export type ImportErrorCode =
  | "MALFORMED_REQUEST"
  | "INVALID_CSV"
  | "INVALID_MAPPING"
  | "INVALID_DATA"
  | "LIMIT_EXCEEDED"
  | "DUPLICATE_IMPORT"
  | "SERVER_CONFIGURATION_ERROR"
  | "DATABASE_ERROR";

export type ImportSuccessResponse = {
  ok: true;
  importId: string;
  rowCount: number;
};

export type ImportErrorResponse = {
  ok: false;
  code: ImportErrorCode;
  message: string;
};

export type ImportApiResponse = ImportSuccessResponse | ImportErrorResponse;

export function isImportApiResponse(value: unknown): value is ImportApiResponse {
  if (!isPlainRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }

  if (value.ok) {
    return (
      typeof value.importId === "string" &&
      typeof value.rowCount === "number"
    );
  }

  return (
    typeof value.code === "string" &&
    IMPORT_ERROR_CODES.has(value.code as ImportErrorCode) &&
    typeof value.message === "string"
  );
}

const IMPORT_ERROR_CODES = new Set<ImportErrorCode>([
  "MALFORMED_REQUEST",
  "INVALID_CSV",
  "INVALID_MAPPING",
  "INVALID_DATA",
  "LIMIT_EXCEEDED",
  "DUPLICATE_IMPORT",
  "SERVER_CONFIGURATION_ERROR",
  "DATABASE_ERROR",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
