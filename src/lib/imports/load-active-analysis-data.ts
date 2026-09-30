import "server-only";

import { eq } from "drizzle-orm";
import type { db } from "@/db";
import { imports, serviceRecords, warranties } from "@/db/schema";
import { filterActiveAnalysisRecords } from "./active-analysis";

export async function loadActiveAnalysisData(
  database: Pick<typeof db, "select">,
  organizationId: string,
) {
  const importStates = await database
    .select({ id: imports.id, excludedAt: imports.excludedAt })
    .from(imports)
    .where(eq(imports.organizationId, organizationId));

  const serviceRows = await database
    .select()
    .from(serviceRecords)
    .where(eq(serviceRecords.organizationId, organizationId));

  const warrantyRows = await database
    .select()
    .from(warranties)
    .where(eq(warranties.organizationId, organizationId));

  return {
    serviceRecords: filterActiveAnalysisRecords(serviceRows, importStates),
    warranties: filterActiveAnalysisRecords(warrantyRows, importStates),
  };
}
