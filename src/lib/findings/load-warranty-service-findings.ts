import "server-only";

import type { WarrantyServiceFinding } from "@/lib/findings/warranty-service";
import { loadCurrentFindings } from "./load-current-findings";
import { getCurrentOrganizationId } from "@/lib/organizations/current-organization";

export async function loadWarrantyServiceFindings(): Promise<
  WarrantyServiceFinding[]
> {
  const organizationId = getCurrentOrganizationId();
  const { db } = await import("@/db");
  return (await loadCurrentFindings(db, organizationId)).warrantyService;
}
