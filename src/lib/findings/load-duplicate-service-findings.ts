import "server-only";

import type { DuplicateServiceFinding } from "@/lib/findings/duplicate-service";
import { loadCurrentFindings } from "./load-current-findings";
import { getCurrentOrganizationId } from "@/lib/organizations/current-organization";

export async function loadDuplicateServiceFindings(): Promise<
  DuplicateServiceFinding[]
> {
  const organizationId = getCurrentOrganizationId();
  const { db } = await import("@/db");
  return (await loadCurrentFindings(db, organizationId)).duplicateService;
}
