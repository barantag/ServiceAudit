import type { CurrentFinding } from "./current-finding";
import { normalizeFindingComparison } from "./repeated-failure";
import {
  DEFAULT_REVIEW,
  REVIEW_STATUS_LABELS,
  isReviewStatus,
  type FindingReview,
  type ReviewStatus,
} from "./review-contract";

export const FINDING_TYPE_FILTER_OPTIONS = [
  { value: "repeated-failure", label: "Tekrarlayan Arıza" },
  { value: "duplicate-service", label: "Mükerrer Servis Kaydı" },
  { value: "abnormal-price", label: "Anormal Servis Fiyatı" },
  { value: "warranty-service", label: "Garanti Süresinde Ücretli Servis" },
] as const satisfies readonly {
  value: CurrentFinding["type"];
  label: string;
}[];

export type FindingStatusFilter = "all" | ReviewStatus;
export type FindingTypeFilter = "all" | CurrentFinding["type"];

export type FindingFilters = {
  status: FindingStatusFilter;
  type: FindingTypeFilter;
  query: string;
  /** Filter to findings whose primary service record belongs to this import. null means all. */
  importId: string | null;
};

export type FindingFilterInput = {
  status?: unknown;
  type?: unknown;
  query?: unknown;
  importId?: unknown;
};

/**
 * An active service import available for filtering on the Findings page.
 * Only imports with service records are included.
 */
export type ActiveServiceImport = {
  id: string;
  fileName: string;
  createdAt: Date;
};

export type ReviewedCurrentFinding =
  | (Extract<CurrentFinding, { type: "repeated-failure" }> & { reviewStatus: ReviewStatus })
  | (Extract<CurrentFinding, { type: "duplicate-service" }> & { reviewStatus: ReviewStatus })
  | (Extract<CurrentFinding, { type: "abnormal-price" }> & { reviewStatus: ReviewStatus })
  | (Extract<CurrentFinding, { type: "warranty-service" }> & { reviewStatus: ReviewStatus });

const MAX_SEARCH_LENGTH = 200;

export type FindingExportRecord = {
  findingKey: string;
  findingType: string;
  reviewStatus: string;
  explanation: string;
  reason: string | null;
  assetCode: string | null;
  assetType: string | null;
  locationCode: string | null;
  locationName: string | null;
  failureType: string | null;
  vendorName: string | null;
  relevantDate: string | null;
  amount: string | null;
  currency: string | null;
  invoiceNumber: string | null;
  warrantyProvider: string | null;
  currentSourceFileName: string | null;
  currentSourceRowNumber: number | null;
  comparisonSourceFileName: string | null;
  comparisonSourceRowNumber: number | null;
  warrantySourceFileName: string | null;
  warrantySourceRowNumber: number | null;
};

export function parseFindingFilters(input: FindingFilterInput): FindingFilters {
  return {
    status: typeof input.status === "string" && isReviewStatus(input.status)
      ? input.status
      : "all",
    type: typeof input.type === "string" && isFindingType(input.type)
      ? input.type
      : "all",
    query: normalizeDisplayQuery(input.query),
    importId: typeof input.importId === "string" && input.importId.length > 0
      ? input.importId
      : null,
  };
}

export function hasActiveFindingFilters(filters: FindingFilters): boolean {
  return filters.status !== "all" || filters.type !== "all" || filters.query.length > 0 || filters.importId !== null;
}

export function createFindingFilterSearchParams(filters: FindingFilters): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.status !== "all") {
    searchParams.set("status", filters.status);
  }
  if (filters.type !== "all") {
    searchParams.set("type", filters.type);
  }
  if (filters.query.length > 0) {
    searchParams.set("q", filters.query);
  }
  if (filters.importId !== null) {
    searchParams.set("importId", filters.importId);
  }

  return searchParams;
}

export function filterCurrentFindings(
  findings: readonly CurrentFinding[],
  reviews: ReadonlyMap<string, Pick<FindingReview, "status">>,
  filters: FindingFilters,
  recordImportIds: ReadonlyMap<string, string | null> = new Map(),
): ReviewedCurrentFinding[] {
  const queryTokens = normalizeFindingComparison(filters.query)
    .split(" ")
    .filter((token) => token.length > 0);

  return findings
    .map((currentFinding): ReviewedCurrentFinding => ({
      ...currentFinding,
      reviewStatus: (reviews.get(currentFinding.finding.findingKey) ?? DEFAULT_REVIEW).status,
    }))
    .filter((currentFinding) => {
      if (filters.status !== "all" && currentFinding.reviewStatus !== filters.status) {
        return false;
      }
      if (filters.type !== "all" && currentFinding.type !== filters.type) {
        return false;
      }

      // Import-scoped filter: use the primary/current service record's importId.
      // Supporting historical evidence from another import does NOT exclude the finding.
      if (filters.importId !== null) {
        const primaryRecordId = getPrimaryRecordId(currentFinding);
        const primaryImportId = primaryRecordId !== null
          ? (recordImportIds.get(primaryRecordId) ?? null)
          : null;
        if (primaryImportId !== filters.importId) {
          return false;
        }
      }

      return queryTokens.length === 0 || matchesSearch(currentFinding, queryTokens);
    })
    .sort((left, right) => compareStableText(
      left.finding.findingKey,
      right.finding.findingKey,
    ));
}

/** Returns the primary service record ID for an import-attribution lookup. */
function getPrimaryRecordId(finding: ReviewedCurrentFinding): string | null {
  switch (finding.type) {
    case "repeated-failure":
      return finding.finding.currentRecordId;
    case "duplicate-service":
      return finding.finding.currentRecordId;
    case "abnormal-price":
      return finding.finding.currentRecordId;
    case "warranty-service":
      return finding.finding.serviceRecordId;
  }
}


export function createFindingExportRecords(
  findings: readonly ReviewedCurrentFinding[],
): FindingExportRecord[] {
  return findings.map(toFindingExportRecord);
}

function matchesSearch(
  currentFinding: ReviewedCurrentFinding,
  queryTokens: readonly string[],
): boolean {
  const searchableText = getSearchableValues(currentFinding)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map(normalizeFindingComparison)
    .join(" ");

  return queryTokens.every((token) => searchableText.includes(token));
}

function getSearchableValues(currentFinding: ReviewedCurrentFinding): (string | null)[] {
  switch (currentFinding.type) {
    case "repeated-failure":
      return [
        currentFinding.finding.assetCode,
        currentFinding.finding.assetType,
        currentFinding.finding.locationCode,
        currentFinding.finding.locationName,
        currentFinding.finding.failureType,
        currentFinding.finding.previousVendor,
        currentFinding.finding.currentVendor,
        currentFinding.finding.previousSourceFileName,
        currentFinding.finding.currentSourceFileName,
        currentFinding.finding.explanation,
      ];
    case "duplicate-service":
      return [
        currentFinding.finding.assetCode,
        currentFinding.finding.assetType,
        currentFinding.finding.locationCode,
        currentFinding.finding.locationName,
        currentFinding.finding.failureType,
        currentFinding.finding.previousVendor,
        currentFinding.finding.currentVendor,
        currentFinding.finding.previousInvoiceNumber,
        currentFinding.finding.currentInvoiceNumber,
        currentFinding.finding.previousSourceFileName,
        currentFinding.finding.currentSourceFileName,
        currentFinding.finding.explanation,
      ];
    case "abnormal-price":
      return [
        currentFinding.finding.assetCode,
        currentFinding.finding.assetType,
        currentFinding.finding.locationCode,
        currentFinding.finding.locationName,
        currentFinding.finding.failureType,
        currentFinding.finding.vendorName,
        currentFinding.finding.sourceFileName,
        currentFinding.finding.explanation,
      ];
    case "warranty-service":
      return [
        currentFinding.finding.assetCode,
        currentFinding.finding.assetType,
        currentFinding.finding.locationCode,
        currentFinding.finding.locationName,
        currentFinding.finding.failureType,
        currentFinding.finding.serviceVendor,
        currentFinding.finding.providerName,
        currentFinding.finding.serviceSourceFileName,
        currentFinding.finding.warrantySourceFileName,
        currentFinding.finding.explanation,
      ];
  }
}

function toFindingExportRecord(currentFinding: ReviewedCurrentFinding): FindingExportRecord {
  const shared = {
    findingKey: currentFinding.finding.findingKey,
    findingType: findingTypeLabel(currentFinding.type),
    reviewStatus: REVIEW_STATUS_LABELS[currentFinding.reviewStatus],
    explanation: currentFinding.finding.explanation,
  };

  switch (currentFinding.type) {
    case "repeated-failure":
      return {
        ...shared,
        reason: null,
        assetCode: currentFinding.finding.assetCode,
        assetType: currentFinding.finding.assetType,
        locationCode: currentFinding.finding.locationCode,
        locationName: currentFinding.finding.locationName,
        failureType: currentFinding.finding.failureType,
        vendorName: currentFinding.finding.currentVendor,
        relevantDate: currentFinding.finding.currentDate,
        amount: currentFinding.finding.currentAmount,
        currency: currentFinding.finding.currentCurrency,
        invoiceNumber: null,
        warrantyProvider: null,
        currentSourceFileName: currentFinding.finding.currentSourceFileName,
        currentSourceRowNumber: currentFinding.finding.currentSourceRowNumber,
        comparisonSourceFileName: currentFinding.finding.previousSourceFileName,
        comparisonSourceRowNumber: currentFinding.finding.previousSourceRowNumber,
        warrantySourceFileName: null,
        warrantySourceRowNumber: null,
      };
    case "duplicate-service":
      return {
        ...shared,
        reason: currentFinding.finding.reasonType === "sameInvoice"
          ? "Aynı fatura numarası"
          : "Aynı servis detayları",
        assetCode: currentFinding.finding.assetCode,
        assetType: currentFinding.finding.assetType,
        locationCode: currentFinding.finding.locationCode,
        locationName: currentFinding.finding.locationName,
        failureType: currentFinding.finding.failureType,
        vendorName: currentFinding.finding.currentVendor,
        relevantDate: currentFinding.finding.serviceDate,
        amount: currentFinding.finding.currentAmount,
        currency: currentFinding.finding.currentCurrency,
        invoiceNumber: currentFinding.finding.currentInvoiceNumber
          ?? currentFinding.finding.previousInvoiceNumber,
        warrantyProvider: null,
        currentSourceFileName: currentFinding.finding.currentSourceFileName,
        currentSourceRowNumber: currentFinding.finding.currentSourceRowNumber,
        comparisonSourceFileName: currentFinding.finding.previousSourceFileName,
        comparisonSourceRowNumber: currentFinding.finding.previousSourceRowNumber,
        warrantySourceFileName: null,
        warrantySourceRowNumber: null,
      };
    case "abnormal-price":
      return {
        ...shared,
        reason: null,
        assetCode: currentFinding.finding.assetCode,
        assetType: currentFinding.finding.assetType,
        locationCode: currentFinding.finding.locationCode,
        locationName: currentFinding.finding.locationName,
        failureType: currentFinding.finding.failureType,
        vendorName: currentFinding.finding.vendorName,
        relevantDate: currentFinding.finding.serviceDate,
        amount: currentFinding.finding.currentAmount,
        currency: currentFinding.finding.currency,
        invoiceNumber: null,
        warrantyProvider: null,
        currentSourceFileName: currentFinding.finding.sourceFileName,
        currentSourceRowNumber: currentFinding.finding.sourceRowNumber,
        comparisonSourceFileName: null,
        comparisonSourceRowNumber: null,
        warrantySourceFileName: null,
        warrantySourceRowNumber: null,
      };
    case "warranty-service":
      return {
        ...shared,
        reason: null,
        assetCode: currentFinding.finding.assetCode,
        assetType: currentFinding.finding.assetType,
        locationCode: currentFinding.finding.locationCode,
        locationName: currentFinding.finding.locationName,
        failureType: currentFinding.finding.failureType,
        vendorName: currentFinding.finding.serviceVendor,
        relevantDate: currentFinding.finding.serviceDate,
        amount: currentFinding.finding.currentServiceAmount,
        currency: currentFinding.finding.currency,
        invoiceNumber: null,
        warrantyProvider: currentFinding.finding.providerName,
        currentSourceFileName: currentFinding.finding.serviceSourceFileName,
        currentSourceRowNumber: currentFinding.finding.serviceSourceRowNumber,
        comparisonSourceFileName: null,
        comparisonSourceRowNumber: null,
        warrantySourceFileName: currentFinding.finding.warrantySourceFileName,
        warrantySourceRowNumber: currentFinding.finding.warrantySourceRowNumber,
      };
  }
}

function findingTypeLabel(type: CurrentFinding["type"]): string {
  const option = FINDING_TYPE_FILTER_OPTIONS.find((candidate) => candidate.value === type);
  if (!option) {
    throw new Error(`Missing finding type label: ${type}`);
  }
  return option.label;
}

function isFindingType(value: string): value is CurrentFinding["type"] {
  return FINDING_TYPE_FILTER_OPTIONS.some((option) => option.value === value);
}

function normalizeDisplayQuery(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH);
}

function compareStableText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}
