import "server-only";

import type { AbnormalPriceFinding } from "@/lib/findings/abnormal-price";
import { loadCurrentFindings } from "./load-current-findings";
import { getCurrentOrganizationId } from "@/lib/organizations/current-organization";

export async function loadAbnormalPriceFindings(): Promise<
  AbnormalPriceFinding[]
> {
  const organizationId = getCurrentOrganizationId();
  const { db } = await import("@/db");
  return (await loadCurrentFindings(db, organizationId)).abnormalPrice;
}
