import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { imports, organizations, warranties } from "@/db/schema";
import type { ImportApiResponse } from "@/lib/imports/import-contract";
import { getCurrentOrganizationId } from "@/lib/organizations/current-organization";
import { createImportFingerprint } from "@/lib/imports/import-fingerprint";
import { parseImportFileBytes } from "@/lib/imports/parse-import-file";
import {
  getMissingRequiredWarrantyFields,
  validateSubmittedWarrantyColumnMappings,
  type WarrantyField,
} from "@/lib/warranties/column-mapping";
import {
  validateWarrantyRows,
  type NormalizedWarrantyRow,
} from "@/lib/warranties/row-validation";
import {
  validateImportFileSize,
  validateImportRowCount,
} from "@/lib/security/request-boundaries";

type ServerWarrantyImportInput = {
  fileName: string;
  fileBytes: Uint8Array;
  submittedMappings: unknown;
  selectedWorksheetName?: unknown;
};

const WARRANTY_BATCH_SIZE = 500;
const DUPLICATE_CONSTRAINT_NAME = "imports_org_file_hash_unique";

export async function importWarrantyCsvToDatabase(
  input: ServerWarrantyImportInput,
): Promise<ImportApiResponse> {
  let organizationId: string;
  try {
    organizationId = getCurrentOrganizationId();
  } catch {

    return {
      ok: false,
      code: "SERVER_CONFIGURATION_ERROR",
      message: "Sunucu organizasyon yapılandırması geçerli değil.",
    };
  }

  if (input.fileName.length === 0 || input.fileName.length > 255) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      message: "Dosya adı geçersiz.",
    };
  }

  const fileSizeResult = validateImportFileSize(input.fileBytes.byteLength);
  if (!fileSizeResult.ok) {
    return {
      ok: false,
      code: "LIMIT_EXCEEDED",
      message: fileSizeResult.message,
    };
  }

  const parseResult = await parseImportFileBytes(
    input.fileName,
    input.fileBytes,
    input.selectedWorksheetName,
  );

  if (!parseResult.ok) {
    return {
      ok: false,
      code: "INVALID_CSV",
      message: parseResult.message,
    };
  }

  const fileHash = createImportFingerprint(
    input.fileBytes,
    parseResult.selectedWorksheetName,
  );

  const rowCountResult = validateImportRowCount(
    parseResult.preview.totalRowCount,
  );
  if (!rowCountResult.ok) {
    return {
      ok: false,
      code: "LIMIT_EXCEEDED",
      message: rowCountResult.message,
    };
  }

  const mappingResult = validateSubmittedWarrantyColumnMappings(
    input.submittedMappings,
    parseResult.preview.columns,
  );

  if (!mappingResult.ok) {
    return {
      ok: false,
      code: "INVALID_MAPPING",
      message: mappingResult.message,
    };
  }

  const missingRequiredFields = getMissingRequiredWarrantyFields(
    mappingResult.mappings,
  );

  if (missingRequiredFields.length > 0) {
    return {
      ok: false,
      code: "INVALID_MAPPING",
      message: `${missingRequiredFields.map((field) => field.label).join(", ")} alanları eşlenmeden içe aktarma yapılamaz.`,
    };
  }

  const validationResult = validateWarrantyRows(
    parseResult.preview.sourceRows,
    mappingResult.mappings,
  );

  if (!validationResult.ready) {
    return {
      ok: false,
      code: "INVALID_MAPPING",
      message: "Zorunlu garanti alanları eşlenmeden içe aktarma yapılamaz.",
    };
  }

  if (validationResult.totalRowCount === 0) {
    return {
      ok: false,
      code: "INVALID_DATA",
      message: "İçe aktarılacak en az bir garanti satırı olmalıdır.",
    };
  }

  if (validationResult.issueCount > 0) {
    const firstIssue = validationResult.issues[0];

    return {
      ok: false,
      code: "INVALID_DATA",
      message: `Dosyada ${validationResult.issueCount} doğrulama hatası var. İlk hata: Satır ${firstIssue.sourceRowNumber}, ${firstIssue.fieldLabel} — ${firstIssue.message}`,
    };
  }

  const { db } = await import("@/db");

  try {
    const [organization] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return {
        ok: false,
        code: "SERVER_CONFIGURATION_ERROR",
        message: "Yapılandırılan organizasyon bulunamadı.",
      };
    }

    const [existingImport] = await db
      .select({ id: imports.id })
      .from(imports)
      .where(
        and(
          eq(imports.organizationId, organizationId),
          eq(imports.fileHash, fileHash),
          isNull(imports.excludedAt),
        ),
      )
      .limit(1);

    if (existingImport) {
      return duplicateImportResponse();
    }

    return await db.transaction(async (transaction) => {
      const [createdImport] = await transaction
        .insert(imports)
        .values({
          organizationId,
          fileName: input.fileName,
          fileHash,
          rowCount: validationResult.totalRowCount,
          status: "processing",
        })
        .returning({ id: imports.id });

      if (!createdImport) {
        throw new Error("Warranty import row was not created");
      }

      const records = validationResult.rows.map((row) => ({
        organizationId,
        importId: createdImport.id,
        assetCode: getRequiredText(row, "assetCode"),
        locationCode: getOptionalText(row, "locationCode"),
        warrantyStartDate: getRequiredText(row, "warrantyStartDate"),
        warrantyEndDate: getRequiredText(row, "warrantyEndDate"),
        providerName: getOptionalText(row, "providerName"),
        description: getOptionalText(row, "description"),
        sourceFileName: input.fileName,
        sourceRowNumber: row.sourceRowNumber,
        rawData: createRawData(parseResult.preview.columns, row.rawValues),
      }));

      for (
        let startIndex = 0;
        startIndex < records.length;
        startIndex += WARRANTY_BATCH_SIZE
      ) {
        await transaction
          .insert(warranties)
          .values(records.slice(startIndex, startIndex + WARRANTY_BATCH_SIZE));
      }

      const completedImports = await transaction
        .update(imports)
        .set({ status: "completed" })
        .where(eq(imports.id, createdImport.id))
        .returning({ id: imports.id });

      if (completedImports.length !== 1) {
        throw new Error("Warranty import row was not completed");
      }

      return {
        ok: true,
        importId: createdImport.id,
        rowCount: validationResult.totalRowCount,
      };
    });
  } catch (error: unknown) {
    if (isDuplicateImportError(error)) {
      return duplicateImportResponse();
    }

    return {
      ok: false,
      code: "DATABASE_ERROR",
      message:
        "Garanti içe aktarma işlemi veritabanına kaydedilemedi. Hiçbir kayıt oluşturulmadı.",
    };
  }
}

function getRequiredText(
  row: NormalizedWarrantyRow,
  field: WarrantyField,
): string {
  const value = row.normalizedValues[field];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Validated warranty row is missing ${field}`);
  }

  return value;
}

function getOptionalText(
  row: NormalizedWarrantyRow,
  field: WarrantyField,
): string | null {
  const value = row.normalizedValues[field];

  return typeof value === "string" && value.length > 0 ? value : null;
}

function createRawData(
  columns: readonly string[],
  rawValues: readonly string[],
): Record<string, string> {
  return Object.fromEntries(
    columns.map((column, index) => [column, rawValues[index] ?? ""]),
  );
}

function duplicateImportResponse(): ImportApiResponse {
  return {
    ok: false,
    code: "DUPLICATE_IMPORT",
    message: "Bu dosya daha önce içe aktarılmış.",
  };
}

function isDuplicateImportError(error: unknown): boolean {
  let currentError: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!isPlainRecord(currentError)) {
      return false;
    }

    if (
      currentError.code === "23505" &&
      (currentError.constraint === undefined ||
        currentError.constraint === DUPLICATE_CONSTRAINT_NAME)
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
