export const MAX_EXCLUSION_REASON_LENGTH = 500;

export type ImportAnalysisAction = "exclude" | "restore";
export type ImportAnalysisState = "active" | "excluded";

export type ImportAnalysisStateRequest =
  | { action: "exclude"; reason: string }
  | { action: "restore"; reason: null };

export type ImportAnalysisStateErrorCode =
  | "INVALID_REQUEST"
  | "IMPORT_NOT_FOUND"
  | "INVALID_IMPORT_STATE"
  | "ACTIVE_DUPLICATE_EXISTS"
  | "SERVER_CONFIGURATION_ERROR"
  | "DATABASE_ERROR";

export type ImportAnalysisStateResponse =
  | {
      ok: true;
      importId: string;
      state: ImportAnalysisState;
      excludedAt: string | null;
    }
  | {
      ok: false;
      code: ImportAnalysisStateErrorCode;
      message: string;
    };

export function validateImportAnalysisStateRequest(
  value: unknown,
):
  | { ok: true; request: ImportAnalysisStateRequest }
  | { ok: false; message: string } {
  if (!isPlainRecord(value) || (value.action !== "exclude" && value.action !== "restore")) {
    return { ok: false, message: "İçe aktarma işlemi geçersiz." };
  }

  if (value.action === "restore") {
    return { ok: true, request: { action: "restore", reason: null } };
  }

  if (typeof value.reason !== "string") {
    return { ok: false, message: "Analizden çıkarma gerekçesi gereklidir." };
  }

  const reason = value.reason.trim().replace(/\s+/g, " ");
  if (reason.length === 0) {
    return { ok: false, message: "Analizden çıkarma gerekçesi gereklidir." };
  }
  if (reason.length > MAX_EXCLUSION_REASON_LENGTH) {
    return {
      ok: false,
      message: `Analizden çıkarma gerekçesi en fazla ${MAX_EXCLUSION_REASON_LENGTH} karakter olabilir.`,
    };
  }

  return { ok: true, request: { action: "exclude", reason } };
}

export function isImportAnalysisStateResponse(
  value: unknown,
): value is ImportAnalysisStateResponse {
  if (!isPlainRecord(value) || typeof value.ok !== "boolean") {
    return false;
  }

  if (value.ok) {
    return (
      typeof value.importId === "string"
      && (value.state === "active" || value.state === "excluded")
      && (value.excludedAt === null || typeof value.excludedAt === "string")
    );
  }

  return (
    typeof value.code === "string"
    && IMPORT_ANALYSIS_ERROR_CODES.has(value.code as ImportAnalysisStateErrorCode)
    && typeof value.message === "string"
  );
}

const IMPORT_ANALYSIS_ERROR_CODES = new Set<ImportAnalysisStateErrorCode>([
  "INVALID_REQUEST",
  "IMPORT_NOT_FOUND",
  "INVALID_IMPORT_STATE",
  "ACTIVE_DUPLICATE_EXISTS",
  "SERVER_CONFIGURATION_ERROR",
  "DATABASE_ERROR",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
