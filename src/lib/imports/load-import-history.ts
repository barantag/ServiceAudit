import "server-only";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import type { db } from "@/db";
import { imports, serviceRecords, warranties } from "@/db/schema";
import {
  createImportHistory,
  type ImportHistoryFilterInput,
  type ImportHistorySourceRecord,
} from "./import-history";

export async function loadImportHistory(
  database: Pick<typeof db, "select">,
  organizationId: string,
  filterInput: ImportHistoryFilterInput,
) {
  const importRows = await database
    .select({
      id: imports.id,
      fileName: imports.fileName,
      rowCount: imports.rowCount,
      status: imports.status,
      excludedAt: imports.excludedAt,
      exclusionReason: imports.exclusionReason,
      createdAt: imports.createdAt,
    })
    .from(imports)
    .where(eq(imports.organizationId, organizationId))
    .orderBy(desc(imports.createdAt), imports.id);

  const serviceCounts = await database
    .select({ importId: serviceRecords.importId, recordCount: count() })
    .from(serviceRecords)
    .where(and(
      eq(serviceRecords.organizationId, organizationId),
      isNotNull(serviceRecords.importId),
    ))
    .groupBy(serviceRecords.importId);

  const warrantyCounts = await database
    .select({ importId: warranties.importId, recordCount: count() })
    .from(warranties)
    .where(and(
      eq(warranties.organizationId, organizationId),
      isNotNull(warranties.importId),
    ))
    .groupBy(warranties.importId);

  const serviceCountByImport = new Map(
    serviceCounts
      .filter((row): row is { importId: string; recordCount: number } => row.importId !== null)
      .map((row) => [row.importId, row.recordCount]),
  );
  const warrantyCountByImport = new Map(
    warrantyCounts
      .filter((row): row is { importId: string; recordCount: number } => row.importId !== null)
      .map((row) => [row.importId, row.recordCount]),
  );

  const sourceRecords: ImportHistorySourceRecord[] = importRows.map((row) => ({
    ...row,
    serviceRecordCount: serviceCountByImport.get(row.id) ?? 0,
    warrantyRecordCount: warrantyCountByImport.get(row.id) ?? 0,
  }));

  return createImportHistory(sourceRecords, filterInput);
}
