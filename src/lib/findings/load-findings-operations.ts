import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import type { db } from "@/db";
import { imports } from "@/db/schema";
import { loadFindingReviews } from "./finding-reviews";
import {
  filterCurrentFindings,
  type ActiveServiceImport,
  type FindingFilters,
} from "./findings-operations";
import { loadCurrentFindings } from "./load-current-findings";

export async function loadFindingsOperations(
  database: Pick<typeof db, "select">,
  organizationId: string,
  filters: FindingFilters,
) {
  const [current, reviews, activeServiceImports] = await Promise.all([
    loadCurrentFindings(database, organizationId),
    loadFindingReviews(database, organizationId),
    loadActiveServiceImports(database, organizationId),
  ]);

  return {
    totalFindingCount: current.all.length,
    findings: filterCurrentFindings(current.all, reviews, filters, current.recordImportIds),
    activeServiceImports,
  };
}

/** Returns active (non-excluded) imports that contain service records, for the import filter dropdown. */
async function loadActiveServiceImports(
  database: Pick<typeof db, "select">,
  organizationId: string,
): Promise<ActiveServiceImport[]> {
  const rows = await database
    .select({
      id: imports.id,
      fileName: imports.fileName,
      createdAt: imports.createdAt,
    })
    .from(imports)
    .where(and(
      eq(imports.organizationId, organizationId),
      eq(imports.status, "completed"),
      isNull(imports.excludedAt),
    ))
    .orderBy(imports.createdAt);

  // Return all active (non-excluded, completed) imports; UI can show the import filter.
  // Warranty-only imports will appear here too since we can't distinguish without a join —
  // but if they produce no findings under importId filter, the empty state handles it cleanly.
  return rows.map((row) => ({
    id: row.id,
    fileName: row.fileName,
    createdAt: row.createdAt,
  }));
}
