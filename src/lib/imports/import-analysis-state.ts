import "server-only";

import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { imports } from "@/db/schema";
import { getCurrentOrganizationId } from "@/lib/organizations/current-organization";
import {
  validateImportAnalysisStateRequest,
  type ImportAnalysisStateResponse,
} from "./import-analysis-state-contract";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUPLICATE_CONSTRAINT_NAME = "imports_org_file_hash_unique";

export async function updateImportAnalysisState(
  importId: string,
  value: unknown,
): Promise<ImportAnalysisStateResponse> {
  let organizationId: string;
  try {
    organizationId = getCurrentOrganizationId();
  } catch {

    return errorResponse(
      "SERVER_CONFIGURATION_ERROR",
      "Sunucu organizasyon yapılandırması geçerli değil.",
    );
  }
  if (!UUID_PATTERN.test(importId)) {
    return errorResponse("INVALID_REQUEST", "İçe aktarma kimliği geçersiz.");
  }

  const validation = validateImportAnalysisStateRequest(value);
  if (!validation.ok) {
    return errorResponse("INVALID_REQUEST", validation.message);
  }

  const { db } = await import("@/db");

  try {
    return await db.transaction(async (transaction): Promise<ImportAnalysisStateResponse> => {
      const [targetImport] = await transaction
        .select({
          id: imports.id,
          fileHash: imports.fileHash,
          status: imports.status,
          excludedAt: imports.excludedAt,
        })
        .from(imports)
        .where(and(
          eq(imports.id, importId),
          eq(imports.organizationId, organizationId),
        ))
        .limit(1);

      if (!targetImport) {
        return errorResponse("IMPORT_NOT_FOUND", "İçe aktarma kaydı bulunamadı.");
      }
      if (targetImport.status !== "completed") {
        return errorResponse(
          "INVALID_IMPORT_STATE",
          "Yalnızca tamamlanmış içe aktarımlar analizden çıkarılabilir veya geri alınabilir.",
        );
      }

      if (validation.request.action === "exclude") {
        if (targetImport.excludedAt !== null) {
          return errorResponse(
            "INVALID_IMPORT_STATE",
            "Bu içe aktarma zaten analiz dışı.",
          );
        }

        const excludedAt = new Date();
        const updated = await transaction
          .update(imports)
          .set({
            excludedAt,
            exclusionReason: validation.request.reason,
          })
          .where(and(
            eq(imports.id, importId),
            eq(imports.organizationId, organizationId),
            eq(imports.status, "completed"),
            isNull(imports.excludedAt),
          ))
          .returning({ id: imports.id });

        if (updated.length !== 1) {
          return errorResponse(
            "INVALID_IMPORT_STATE",
            "İçe aktarma durumu değişti. Sayfayı yenileyip tekrar deneyin.",
          );
        }

        return {
          ok: true,
          importId,
          state: "excluded",
          excludedAt: excludedAt.toISOString(),
        };
      }

      if (targetImport.excludedAt === null) {
        return errorResponse(
          "INVALID_IMPORT_STATE",
          "Bu içe aktarma zaten analizde.",
        );
      }

      const [activeDuplicate] = await transaction
        .select({ id: imports.id })
        .from(imports)
        .where(and(
          eq(imports.organizationId, organizationId),
          eq(imports.fileHash, targetImport.fileHash),
          isNull(imports.excludedAt),
          ne(imports.id, importId),
        ))
        .limit(1);

      if (activeDuplicate) {
        return activeDuplicateResponse();
      }

      const restored = await transaction
        .update(imports)
        .set({ excludedAt: null, exclusionReason: null })
        .where(and(
          eq(imports.id, importId),
          eq(imports.organizationId, organizationId),
          eq(imports.status, "completed"),
          isNotNull(imports.excludedAt),
        ))
        .returning({ id: imports.id });

      if (restored.length !== 1) {
        return errorResponse(
          "INVALID_IMPORT_STATE",
          "İçe aktarma durumu değişti. Sayfayı yenileyip tekrar deneyin.",
        );
      }

      return { ok: true, importId, state: "active", excludedAt: null };
    });
  } catch (error: unknown) {
    if (isDuplicateImportError(error)) {
      return activeDuplicateResponse();
    }

    return errorResponse(
      "DATABASE_ERROR",
      "İçe aktarmanın analiz durumu değiştirilemedi. Lütfen tekrar deneyin.",
    );
  }
}

function activeDuplicateResponse(): ImportAnalysisStateResponse {
  return errorResponse(
    "ACTIVE_DUPLICATE_EXISTS",
    "Aynı dosyanın başka bir içe aktarımı şu anda analizde. Önce bu aktif kaydı kontrol edin.",
  );
}

function errorResponse(
  code: Exclude<ImportAnalysisStateResponse, { ok: true }>["code"],
  message: string,
): ImportAnalysisStateResponse {
  return { ok: false, code, message };
}

function isDuplicateImportError(error: unknown): boolean {
  let currentError: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!isPlainRecord(currentError)) {
      return false;
    }
    if (
      currentError.code === "23505"
      && (currentError.constraint === undefined
        || currentError.constraint === DUPLICATE_CONSTRAINT_NAME)
    ) {
      return true;
    }
    currentError = currentError.cause;
  }

  return false;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
