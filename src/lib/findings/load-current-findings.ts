import "server-only";
import type { db } from "@/db";
import { loadActiveAnalysisData } from "@/lib/imports/load-active-analysis-data";
import { detectRepeatedFailureFindings } from "./repeated-failure";
import { detectDuplicateServiceFindings } from "./duplicate-service";
import { detectAbnormalPriceFindings } from "./abnormal-price";
import { detectWarrantyServiceFindings } from "./warranty-service";
import type { CurrentFinding } from "./current-finding";

// All callers use the same source snapshot and four unchanged detectors.
export async function loadCurrentFindings(
  database: Pick<typeof db, "select">,
  organizationId: string,
) {
  const activeData = await loadActiveAnalysisData(database, organizationId);
  const records = activeData.serviceRecords;
  const warrantyRecords = activeData.warranties;

  // Build a record-id → import-id lookup from service records (importId already on DB rows).
  const recordImportIds = new Map<string, string | null>(
    records.map((r) => [r.id, r.importId ?? null]),
  );

  const repeatedFailure = detectRepeatedFailureFindings(records);
  const duplicateService = detectDuplicateServiceFindings(records);
  const abnormalPrice = detectAbnormalPriceFindings(records);
  const warrantyService = detectWarrantyServiceFindings(records, warrantyRecords);
  const all: CurrentFinding[] = [
    ...repeatedFailure.map((finding): CurrentFinding => ({ type: "repeated-failure", finding })),
    ...duplicateService.map((finding): CurrentFinding => ({ type: "duplicate-service", finding })),
    ...abnormalPrice.map((finding): CurrentFinding => ({ type: "abnormal-price", finding })),
    ...warrantyService.map((finding): CurrentFinding => ({ type: "warranty-service", finding })),
  ];
  return { repeatedFailure, duplicateService, abnormalPrice, warrantyService, all, records, warrantyRecords, recordImportIds };
}

export function resolveCurrentFinding(findings: readonly CurrentFinding[], key: string) {
  return findings.find((entry) => entry.finding.findingKey === key) ?? null;
}

/**
 * Returns the import ID of the PRIMARY/CURRENT service record for a finding.
 *
 * - repeated-failure: current service record import
 * - duplicate-service: current record import (the finding-subject record)
 * - abnormal-price: the current (evaluated) service record import
 * - warranty-service: the service record import (not the warranty import)
 */
export function resolveFindingImportId(
  finding: CurrentFinding,
  recordImportIds: ReadonlyMap<string, string | null>,
): string | null {
  switch (finding.type) {
    case "repeated-failure":
      return recordImportIds.get(finding.finding.currentRecordId) ?? null;
    case "duplicate-service":
      return recordImportIds.get(finding.finding.currentRecordId) ?? null;
    case "abnormal-price":
      return recordImportIds.get(finding.finding.currentRecordId) ?? null;
    case "warranty-service":
      return recordImportIds.get(finding.finding.serviceRecordId) ?? null;
  }
}
