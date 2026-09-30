import "server-only";

import type { RepeatedFailureFinding } from "@/lib/findings/repeated-failure";
import { loadCurrentFindings } from "./load-current-findings";
import { getCurrentOrganizationId } from "@/lib/organizations/current-organization";

export async function loadRepeatedFailureFindings(): Promise<
  RepeatedFailureFinding[]
> {
  const organizationId = getCurrentOrganizationId();
  const { db } = await import("@/db");
  return (await loadCurrentFindings(db, organizationId)).repeatedFailure;
}
